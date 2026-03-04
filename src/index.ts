import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import { Elysia, t } from "elysia";
import { cache } from "@/cache";
import { env } from "@/env";
import { loggingPlugin } from "@/plugins/logging";
import { negotiationPlugin } from "@/plugins/negotiation";
import { securityPlugin } from "@/plugins/security";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fetchAggregatedData } from "@/services/package";
import {
  fetchFilesData,
  getFileAtPath,
  refreshFilesData,
  toTerminalFileSystem,
} from "@/services/files";
import {
  DEFAULT_SEARCH_INCLUDE,
  convertIncludeListToOptions,
  fetchDeploymentLinks,
  fetchEnhancedRepositoryData,
  fetchNpmPackageInfo,
  fetchRepositoryDeploymentsWithFallback,
  filterReposByQuery,
  formatBasicRepo,
  paginate,
  parseCommaSeparatedList,
  selectFields,
  sortRepos,
  type GitHubRepo,
} from "@/services/repos";
import {
  fetchReadme,
  fetchRepositoryLanguages,
  getRepositories,
} from "@/services/github";
import { usingBuiltinSemver } from "@/semver";

const LINKS = [
  { href: "/package.json", label: "package.json" },
  { href: "/repos", label: "repos" },
  { href: "/files", label: "files" },
];

const openapiConfig = {
  path: "/docs",
  exclude: {
    paths: ["/*"],
  },
  documentation: {
    info: {
      title: "packagejson core API",
      version: "2.0.0",
      description:
        "Simplified packagejson API with package aggregation, repo search/enrichment, and VFS traversal.",
    },
    tags: [{ name: "app", description: "Core endpoints" }],
  },
};

const renderLinksHtml = () => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>packagejson</title>
  </head>
  <body>
    ${LINKS.map((link) => `<a href="${link.href}">${link.label}</a><br />`).join("")}
  </body>
</html>
`;

const renderErrorHtml = (status: number, message: string) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${status}</title>
  </head>
  <body>
    <h1>${status}</h1>
    <p>${message}</p>
  </body>
</html>
`;

const parseCommaSeparatedEnv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const corsOrigins = parseCommaSeparatedEnv(env.CORS_ORIGIN);
const corsOrigin =
  corsOrigins.length === 0 || corsOrigins.includes("*")
    ? env.CORS_ALLOW_CREDENTIALS
      ? true
      : "*"
    : corsOrigins;

const isUrl = (str: unknown): boolean => {
  if (typeof str !== "string") return false;
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

const objectToLinks = (prefix: string, obj: Record<string, unknown>): string => {
  const links = Object.keys(obj)
    .map((key) => {
      const value = obj[key];
      const encodedKey = encodeURIComponent(key);
      const url = isUrl(value) ? String(value) : `${prefix}/${encodedKey}`;
      return `<a href="${url}">${key}</a><br>`;
    })
    .join("");

  return `
    <html>
    <body>
      ${links}
    </body>
    </html>
  `;
};

const normalizeEtag = (value: string): string => value.trim().replace(/^W\//, "");

const hasMatchingEtag = (
  requestIfNoneMatch: string | null,
  currentEtag: string
): boolean => {
  if (!requestIfNoneMatch) return false;
  if (requestIfNoneMatch.trim() === "*") return true;

  const normalizedCurrent = normalizeEtag(currentEtag);
  return requestIfNoneMatch
    .split(",")
    .map((entry) => normalizeEtag(entry))
    .some((entry) => entry === normalizedCurrent);
};

const createCachedJsonResponse = (
  request: Request,
  payload: unknown,
  maxAgeSeconds = 300
): Response => {
  const body = JSON.stringify(payload);
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  const normalizedMaxAge = Math.max(0, Math.floor(maxAgeSeconds));
  const staleWhileRevalidate = Math.max(60, normalizedMaxAge * 2);
  const cacheControl = `public, max-age=${normalizedMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
    etag,
  };

  if (hasMatchingEtag(request.headers.get("if-none-match"), etag)) {
    return new Response(null, {
      status: 304,
      headers,
    });
  }

  return new Response(body, {
    status: 200,
    headers,
  });
};

export const createApp = async () =>
  new Elysia({
    name: "packagejson-core",
    serve: env.PORT ? { port: env.PORT } : undefined,
  })
    .use(openapi(openapiConfig))
    .use(
      cors({
        origin: corsOrigin,
        methods: env.CORS_METHODS,
        allowedHeaders: env.CORS_HEADERS,
        exposeHeaders: env.CORS_EXPOSE_HEADERS || undefined,
        credentials: env.CORS_ALLOW_CREDENTIALS,
        maxAge: env.CORS_MAX_AGE,
        preflight: true,
      })
    )
    .use(securityPlugin)
    .use(negotiationPlugin)
    .use(loggingPlugin)
    .state("usesBuiltinSemver", usingBuiltinSemver)
    .decorate("cache", cache)
    .get(
      "/",
      ({ request }) => {
        const prefersHtml = (request.headers.get("accept") ?? "").includes("text/html");

        if (prefersHtml) {
          return new Response(renderLinksHtml(), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        return createCachedJsonResponse(request, { links: LINKS }, 60);
      },
      {
        response: {
          200: t.Any(),
        },
        detail: {
          summary: "Root links",
          tags: ["app"],
        },
      }
    )
    .use(
      await staticPlugin({
        assets: join(import.meta.dir, "..", "public"),
        prefix: "/",
        indexHTML: true,
      })
    )
    .get(
      "/package.json",
      async ({ query, request, set }) => {
        const versionParam = query.version;
        const validTypes = ["min", "max", "minmax"];
        const versionType =
          versionParam && validTypes.includes(versionParam)
            ? (versionParam as "min" | "max" | "minmax")
            : "max";

        const data = await fetchAggregatedData(versionType);
        if (!data) {
          set.status = 500;
          return { error: "Failed to fetch aggregated package data" };
        }

        return createCachedJsonResponse(request, data, 300);
      },
      {
        query: t.Optional(
          t.Object({
            version: t.Optional(
              t.Union([t.Literal("min"), t.Literal("max"), t.Literal("minmax")])
            ),
          })
        ),
        response: {
          200: t.Any(),
          304: t.Null(),
          500: t.Object({ error: t.String() }),
        },
        detail: {
          summary: "Aggregated package.json data",
          tags: ["app"],
        },
      }
    )
    .get(
      "/package.json/refresh",
      async ({ query, set }) => {
        const versionParam = query.version;
        const validTypes = ["min", "max", "minmax"];
        const versionType =
          versionParam && validTypes.includes(versionParam)
            ? (versionParam as "min" | "max" | "minmax")
            : "max";

        await cache.del(`packageData-${versionType}`);

        const data = await fetchAggregatedData(versionType);
        if (!data) {
          set.status = 500;
          return { error: "Failed to refresh aggregated package data" };
        }

        return new Response(null, {
          status: 302,
          headers: { Location: `/package.json?version=${versionType}` },
        });
      },
      {
        query: t.Optional(
          t.Object({
            version: t.Optional(
              t.Union([t.Literal("min"), t.Literal("max"), t.Literal("minmax")])
            ),
          })
        ),
        response: {
          302: t.Null(),
          500: t.Object({ error: t.String() }),
        },
        detail: {
          summary: "Refresh package aggregation cache",
          tags: ["app"],
        },
      }
    )
    .get(
      "/files",
      async ({ query, request }) => {
        const data = await fetchFilesData();

        if (query.format === "terminal") {
          return createCachedJsonResponse(request, toTerminalFileSystem(data), 120);
        }

        const prefersHtml = (request.headers.get("accept") ?? "").includes("text/html");

        if (prefersHtml) {
          return new Response(objectToLinks("/files", data), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        return createCachedJsonResponse(request, data, 120);
      },
      {
        query: t.Optional(
          t.Object({
            format: t.Optional(t.Literal("terminal")),
          })
        ),
        response: {
          200: t.Any(),
        },
        detail: {
          summary: "File system tree",
          description:
            "Returns v1-style VFS object by default, or FileSystemItem root when format=terminal.",
          tags: ["app"],
        },
      }
    )
    .get(
      "/files/refresh",
      async () => {
        await refreshFilesData();
        return new Response(null, {
          status: 302,
          headers: { Location: "/files" },
        });
      },
      {
        response: {
          302: t.Null(),
        },
        detail: {
          summary: "Refresh files cache",
          tags: ["app"],
        },
      }
    )
    .get("/files/*", async ({ params, request, set }) => {
      const path = params["*"];
      if (!path) {
        set.status = 404;
        return { error: "File or directory not found" };
      }

      const data = await fetchFilesData();
      const pathSegments = path.split("/").filter(Boolean);
      const result = getFileAtPath(data, pathSegments);

      if (result === null || result === undefined) {
        set.status = 404;
        return { error: "File or directory not found" };
      }

      const prefersHtml = (request.headers.get("accept") ?? "").includes("text/html");

      if (prefersHtml) {
        if (typeof result === "object" && result !== null && !Array.isArray(result)) {
          return new Response(objectToLinks(`/files/${path}`, result as Record<string, unknown>), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        if (typeof result === "string") {
          if (isUrl(result)) {
            return new Response(`<a href="${result}">${pathSegments[pathSegments.length - 1]}</a>`, {
              headers: { "content-type": "text/html; charset=utf-8" },
            });
          }

          return new Response(result, {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
      }

      if (typeof result === "string" && isUrl(result)) {
        return createCachedJsonResponse(request, { file: result }, 120);
      }

      if (typeof result === "string") {
        return new Response(result, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=120, stale-while-revalidate=240",
          },
        });
      }

      return createCachedJsonResponse(request, result, 120);
    })
    .get(
      "/repos",
      async ({ query, request }) => {
        const type = query.type || "public";
        const q = (query.q || "").trim();
        const fieldsList = parseCommaSeparatedList(query.fields || "");
        const includeFromQuery = parseCommaSeparatedList(query.include || "");
        const includeList =
          q && includeFromQuery.length === 0
            ? [...DEFAULT_SEARCH_INCLUDE]
            : includeFromQuery;
        const sort = query.sort || "updated";
        const limit = parseInt(query.limit || "100", 10);
        const offset = parseInt(query.offset || "0", 10);

        const repos = await getRepositories(type);
        if (!repos) {
          return createCachedJsonResponse(
            request,
            {
              data: [],
              meta: { total: 0, limit, offset, hasMore: false },
            },
            120
          );
        }

        let result = repos.map((repo) => formatBasicRepo(repo as unknown as GitHubRepo)) as Array<
          Record<string, unknown> & {
            owner?: { login?: string };
            name?: string;
            full_name?: string;
            description?: string | null;
            topics?: unknown;
            stars?: number;
            updated_at?: string;
            html_url?: string;
          }
        >;

        if (q) {
          result = await filterReposByQuery(result, q);
        }

        if (includeList.length > 0) {
          result = await Promise.all(
            result.map(async (repo) => {
              const owner = repo.owner?.login;
              const repoName = repo.name;

              if (!owner || !repoName) {
                return repo;
              }

              const enhanced = await fetchEnhancedRepositoryData(
                repoName,
                owner,
                convertIncludeListToOptions(includeList)
              );

              return enhanced ? { ...repo, ...enhanced } : repo;
            })
          );
        }

        if (fieldsList.length > 0) {
          result = result.map((repo) => selectFields(repo, fieldsList)) as typeof result;
        }

        result = sortRepos(result, sort);

        const paginated = paginate(result, limit, offset);

        const prefersHtml = (request.headers.get("accept") ?? "").includes("text/html");

        if (prefersHtml) {
          const listItems = paginated.data
            .map((repo) => {
              const description =
                typeof repo.description === "string" ? ` - ${repo.description}` : "";
              const stars = typeof repo.stars === "number" ? ` ⭐ ${repo.stars}` : "";
              const owner = (repo.owner as { login?: string })?.login || "unknown";
              const repoName = typeof repo.name === "string" ? repo.name : "unknown";
              return `<li><a href="/repos/${owner}/${repoName}">${repoName}</a>${description}${stars}</li>`;
            })
            .join("\n");

          return new Response(`<ul style="list-style:none;margin:0;padding:0;">${listItems}</ul>`, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        return createCachedJsonResponse(
          request,
          {
            data: paginated.data,
            meta: paginated.meta,
          },
          120
        );
      },
      {
        query: t.Optional(
          t.Object({
            type: t.Optional(
              t.Union([t.Literal("all"), t.Literal("public"), t.Literal("private")])
            ),
            q: t.Optional(t.String()),
            include: t.Optional(t.String()),
            fields: t.Optional(t.String()),
            sort: t.Optional(
              t.Union([t.Literal("updated"), t.Literal("stars"), t.Literal("name")])
            ),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Any(),
        },
        detail: {
          summary: "List/search repositories",
          tags: ["app"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo",
      async ({ params, query, request, set }) => {
        const { owner, repo } = params;
        const fieldsList = parseCommaSeparatedList(query.fields || "");
        const includeList = parseCommaSeparatedList(query.include || "");
        const resolvedIncludeList =
          includeList.length > 0 ? includeList : [...DEFAULT_SEARCH_INCLUDE];

        const repoData = await fetchEnhancedRepositoryData(
          repo,
          owner,
          convertIncludeListToOptions(resolvedIncludeList)
        );

        if (!repoData) {
          set.status = 404;
          return {
            error: "Repository not found",
            message: `Repository ${owner}/${repo} not found or not accessible`,
          };
        }

        let result = repoData as Record<string, unknown>;

        if (fieldsList.length > 0) {
          result = selectFields(result, fieldsList);
        }

        if (!fieldsList.length || fieldsList.includes("_links")) {
          result._links = {
            readme: `/repos/${owner}/${repo}/readme`,
            languages: `/repos/${owner}/${repo}/languages`,
            deployments: `/repos/${owner}/${repo}/deployments`,
            npm: `/repos/${owner}/${repo}/npm`,
            "deployment-links": `/repos/${owner}/${repo}/deployment-links`,
          };
        }

        const prefersHtml = (request.headers.get("accept") ?? "").includes("text/html");

        if (prefersHtml) {
          return new Response(
            `<html><body><h1>${String(result.name || repo)}</h1><p>${String(result.description || "")}</p></body></html>`,
            {
              headers: { "content-type": "text/html; charset=utf-8" },
            }
          );
        }

        return createCachedJsonResponse(request, { data: result }, 120);
      },
      {
        params: t.Object({ owner: t.String(), repo: t.String() }),
        query: t.Optional(
          t.Object({
            include: t.Optional(t.String()),
            fields: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Any(),
          404: t.Object({ error: t.String(), message: t.String() }),
        },
        detail: {
          summary: "Get repository details",
          tags: ["app"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/readme",
      async ({ params, request, set }) => {
        const readme = await fetchReadme(params.repo, params.owner);

        if (!readme) {
          set.status = 404;
          return { error: "README not found" };
        }

        return createCachedJsonResponse(request, { data: { readme } }, 120);
      },
      {
        params: t.Object({ owner: t.String(), repo: t.String() }),
        response: {
          200: t.Any(),
          304: t.Null(),
          404: t.Object({ error: t.String() }),
        },
      }
    )
    .get(
      "/repos/:owner/:repo/languages",
      async ({ params, request }) => {
        const languages = await fetchRepositoryLanguages(params.repo, params.owner);
        return createCachedJsonResponse(
          request,
          { data: { languages: languages || {} } },
          120
        );
      },
      {
        params: t.Object({ owner: t.String(), repo: t.String() }),
        response: {
          200: t.Any(),
          304: t.Null(),
        },
      }
    )
    .get(
      "/repos/:owner/:repo/deployments",
      async ({ params, request }) => {
        const deployments = await fetchRepositoryDeploymentsWithFallback(params.repo, params.owner);
        return createCachedJsonResponse(request, { data: { deployments } }, 120);
      },
      {
        params: t.Object({ owner: t.String(), repo: t.String() }),
        response: {
          200: t.Any(),
          304: t.Null(),
        },
      }
    )
    .get(
      "/repos/:owner/:repo/npm",
      async ({ params, request, set }) => {
        const npm = await fetchNpmPackageInfo(params.repo, params.owner);

        if (!npm) {
          set.status = 404;
          return { error: "NPM package info not found" };
        }

        return createCachedJsonResponse(request, { data: { npm } }, 120);
      },
      {
        params: t.Object({ owner: t.String(), repo: t.String() }),
        response: {
          200: t.Any(),
          304: t.Null(),
          404: t.Object({ error: t.String() }),
        },
      }
    )
    .get(
      "/repos/:owner/:repo/deployment-links",
      async ({ params, request }) => {
        const deploymentLinks = await fetchDeploymentLinks(params.repo, params.owner);
        return createCachedJsonResponse(
          request,
          { data: { deployment_links: deploymentLinks } },
          120
        );
      },
      {
        params: t.Object({ owner: t.String(), repo: t.String() }),
        response: {
          200: t.Any(),
          304: t.Null(),
        },
      }
    )
    .get(
      "/health",
      () => {
        return new Response("ok", {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
      {
        response: {
          200: t.String(),
        },
        detail: {
          summary: "Health check",
          tags: ["app"],
        },
      }
    )
    .onError(({ code, error, request, set }) => {
      const status = code === "NOT_FOUND" ? 404 : 500;
      const message = error instanceof Error ? error.message : "Unexpected error";
      set.status = status;
      set.headers["Cache-Control"] = "no-store";

      const prefersHtml = (request.headers.get("accept") ?? "").includes("text/html");
      if (prefersHtml) {
        return new Response(renderErrorHtml(status, message), {
          status,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      return {
        error: code ?? "INTERNAL_ERROR",
        message,
      };
    })
    .all(
      "*",
      ({ set }) => {
        set.status = 404;
        set.headers["Cache-Control"] = "no-store";
        return "NOT_FOUND";
      },
      {
        detail: {
          hide: true,
        },
      }
    );

if (import.meta.main) {
  const app = await createApp();
  const listenOptions = env.PORT ? { port: env.PORT } : {};
  const instance = app.listen(listenOptions);
  const host = instance.server?.hostname ?? "localhost";
  const port = instance.server?.port ?? env.PORT ?? "unknown";
  console.log(`Elysia is running at http://${host}:${port}`);
}
