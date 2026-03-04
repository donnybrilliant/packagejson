import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import { Elysia, t } from "elysia";
import { cache } from "@/cache";
import { env } from "@/env";
import { loggingPlugin } from "@/plugins/logging";
import { negotiationPlugin } from "@/plugins/negotiation";
import { join } from "node:path";
import {
  getNetlifySites,
  getNetlifySite,
  getNetlifySiteDeploys,
  getRenderServices,
  getRenderService,
  getRenderServiceDeploys,
  getVercelProjects,
  getVercelProject,
  getVercelProjectDeployments,
} from "@/services/deployments";
import {
  getNpmPackage,
  searchNpmPackages,
  getNpmPackageDownloads,
  getNpmPackageVersion,
} from "@/services/npm";
import { fetchAggregatedData } from "@/services/package";
import {
  fetchFilesData,
  refreshFilesData,
  getFileAtPath,
} from "@/services/files";
import {
  fetchEnhancedRepositoryData,
  fetchNpmPackageInfo,
  fetchDeploymentLinks,
  formatBasicRepo,
  parseCommaSeparatedList,
  selectFields,
  sortRepos,
  paginate,
  convertIncludeListToOptions,
  type GitHubRepo,
} from "@/services/repos";
import {
  getRepositories,
  fetchReadme,
  fetchRepositoryLanguages,
  fetchCommitActivity,
  fetchContributorStats,
  fetchCodeFrequency,
  fetchParticipation,
  fetchReleases,
  fetchWorkflows,
  fetchWorkflowRuns,
  fetchCICDStatus,
  fetchDeployments,
} from "@/services/github";
import { usingBuiltinSemver } from "@/semver";

const LINKS = [
  { href: "/package.json", label: "package.json" },
  { href: "/repos", label: "repos" },
  { href: "/files", label: "files" },
  { href: "/npm/elysia", label: "npm" },
  { href: "/netlify", label: "netlify" },
  { href: "/vercel", label: "vercel" },
  { href: "/render", label: "render" },
];

const openapiConfig = {
  path: "/docs",
  documentation: {
    info: {
      title: "packagejson v1 (Elysia/Bun)",
      version: "1.0.0",
      description:
        "Elysia/Bun migration of packagejson v1 routes. OpenAPI generated from runtime schemas.",
    },
    tags: [{ name: "app", description: "General endpoints" }],
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
    ${LINKS.map(
      (link) => `<a href="${link.href}">${link.label}</a><br />`
    ).join("")}
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

const isUrl = (str: unknown): boolean => {
  if (typeof str !== "string") return false;
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

const objectToLinks = (
  prefix: string,
  obj: Record<string, unknown>
): string => {
  const links = Object.keys(obj)
    .map((key) => {
      const value = obj[key];
      const encodedKey = encodeURIComponent(key);
      const url = isUrl(value) ? value : `${prefix}/${encodedKey}`;
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

export const createApp = async () =>
  new Elysia({
    name: "packagejson-v1",
    // Prefer configuration-style port; if unset, Elysia defaults to 3000.
    serve: env.PORT ? { port: env.PORT } : undefined,
  })
    .use(openapi(openapiConfig))
    .use(negotiationPlugin)
    .use(loggingPlugin)
    .state("usesBuiltinSemver", usingBuiltinSemver)
    .decorate("cache", cache)
    // Root route - handles both HTML and JSON based on Accept header
    // Must be defined BEFORE staticPlugin to take precedence
    .get(
      "/",
      ({ request }) => {
        const acceptHeader = request.headers.get("accept") ?? "";
        const prefersHtml = acceptHeader.includes("text/html");

        if (prefersHtml) {
          return new Response(renderLinksHtml(), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        // Return JSON for JSON requests or default
        return { links: LINKS };
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
    // Serve static files from public directory (standard Elysia approach)
    // Using await for Fullstack Dev Server support with HMR
    // indexHTML: true serves index.html for unmatched routes
    // prefix: "/" serves files at root instead of /public
    .use(
      await staticPlugin({
        assets: join(import.meta.dir, "..", "public"),
        prefix: "/",
        indexHTML: true,
      })
    )
    .get(
      "/package.json",
      async ({ query, set }) => {
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
        return data;
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
          200: t.Object({
            dependencies: t.Record(t.String(), t.String()),
            devDependencies: t.Record(t.String(), t.String()),
          }),
          500: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Aggregated package.json data",
          description:
            "Retrieves aggregated dependency data from all repositories. Supports min, max, or minmax version aggregation.",
          tags: ["packages"],
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

        // Clear cache and fetch fresh data
        const cacheKey = `packageData-${versionType}`;
        await cache.del(cacheKey);

        const data = await fetchAggregatedData(versionType);
        if (!data) {
          set.status = 500;
          return { error: "Failed to refresh aggregated package data" };
        }

        set.status = 302;
        set.headers.Location = `/package.json?version=${versionType}`;
        return new Response(null, { status: 302 });
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
          500: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Refresh aggregated package.json data",
          description:
            "Refreshes the cached aggregated package data and redirects to /package.json",
          tags: ["packages"],
        },
      }
    )
    // Netlify endpoints
    .get(
      "/netlify",
      async ({ query }) => {
        const result = await getNetlifySites({
          filter: query.filter,
          sort: query.sort,
          page: query.page ? Number.parseInt(query.page, 10) : undefined,
          per_page: query.per_page
            ? Number.parseInt(query.per_page, 10)
            : undefined,
        });
        return result;
      },
      {
        query: t.Optional(
          t.Object({
            filter: t.Optional(t.String()),
            sort: t.Optional(t.String()),
            page: t.Optional(t.String()),
            per_page: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Any(),
        },
        detail: {
          summary: "List Netlify sites",
          description:
            "Retrieves a list of Netlify sites with optional filtering, sorting, and pagination",
          tags: ["deployments"],
        },
      }
    )
    .get(
      "/netlify/:siteId",
      async ({ params, set }) => {
        const site = await getNetlifySite(params.siteId);
        if (!site) {
          set.status = 404;
          return { error: "Site not found" };
        }
        return { data: site };
      },
      {
        params: t.Object({
          siteId: t.String({ minLength: 1 }),
        }),
        response: {
          200: t.Object({
            data: t.Any(),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get Netlify site",
          description: "Retrieves details for a specific Netlify site",
          tags: ["deployments"],
        },
      }
    )
    .get(
      "/netlify/:siteId/deploys",
      async ({ params, query }) => {
        const deploys = await getNetlifySiteDeploys(params.siteId, {
          page: query.page ? Number.parseInt(query.page, 10) : undefined,
          per_page: query.per_page
            ? Number.parseInt(query.per_page, 10)
            : undefined,
        });
        if (!deploys) {
          return { data: [] };
        }
        return { data: deploys };
      },
      {
        params: t.Object({
          siteId: t.String({ minLength: 1 }),
        }),
        query: t.Optional(
          t.Object({
            page: t.Optional(t.String()),
            per_page: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Array(t.Any()),
          }),
        },
        detail: {
          summary: "Get Netlify site deploys",
          description:
            "Retrieves deployment history for a specific Netlify site",
          tags: ["deployments"],
        },
      }
    )
    // Vercel endpoints
    .get(
      "/vercel",
      async ({ query }) => {
        const result = await getVercelProjects({
          limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
          since: query.since ? Number.parseInt(query.since, 10) : undefined,
          until: query.until ? Number.parseInt(query.until, 10) : undefined,
          teamId: query.teamId,
        });
        return result;
      },
      {
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.String()),
            since: t.Optional(t.String()),
            until: t.Optional(t.String()),
            teamId: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Any(),
        },
        detail: {
          summary: "List Vercel projects",
          description:
            "Retrieves a list of Vercel projects with optional filtering and pagination",
          tags: ["deployments"],
        },
      }
    )
    .get(
      "/vercel/:projectId",
      async ({ params, query, set }) => {
        const project = await getVercelProject(params.projectId, query.teamId);
        if (!project) {
          set.status = 404;
          return { error: "Project not found" };
        }
        return { data: project };
      },
      {
        params: t.Object({
          projectId: t.String({ minLength: 1 }),
        }),
        query: t.Optional(
          t.Object({
            teamId: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Any(),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get Vercel project",
          description: "Retrieves details for a specific Vercel project",
          tags: ["deployments"],
        },
      }
    )
    .get(
      "/vercel/:projectId/deployments",
      async ({ params, query }) => {
        const deployments = await getVercelProjectDeployments(
          params.projectId,
          {
            limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
            since: query.since ? Number.parseInt(query.since, 10) : undefined,
            until: query.until ? Number.parseInt(query.until, 10) : undefined,
            teamId: query.teamId,
            target: query.target,
          }
        );
        if (!deployments) {
          return { data: [] };
        }
        return { data: deployments };
      },
      {
        params: t.Object({
          projectId: t.String({ minLength: 1 }),
        }),
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.String()),
            since: t.Optional(t.String()),
            until: t.Optional(t.String()),
            teamId: t.Optional(t.String()),
            target: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Array(t.Any()),
          }),
        },
        detail: {
          summary: "Get Vercel project deployments",
          description:
            "Retrieves deployment history for a specific Vercel project",
          tags: ["deployments"],
        },
      }
    )
    // Render endpoints
    .get(
      "/render",
      async ({ query }) => {
        const result = await getRenderServices({
          limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
          name: query.name,
        });
        return result;
      },
      {
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.String()),
            name: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Any(),
        },
        detail: {
          summary: "List Render services",
          description:
            "Retrieves a list of Render services with optional filtering",
          tags: ["deployments"],
        },
      }
    )
    .get(
      "/render/:serviceId",
      async ({ params, set }) => {
        const service = await getRenderService(params.serviceId);
        if (!service) {
          set.status = 404;
          return { error: "Service not found" };
        }
        return { data: service };
      },
      {
        params: t.Object({
          serviceId: t.String({ minLength: 1 }),
        }),
        response: {
          200: t.Object({
            data: t.Any(),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get Render service",
          description: "Retrieves details for a specific Render service",
          tags: ["deployments"],
        },
      }
    )
    .get(
      "/render/:serviceId/deploys",
      async ({ params, query }) => {
        const deploys = await getRenderServiceDeploys(params.serviceId, {
          limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
        });
        if (!deploys) {
          return { data: [] };
        }
        return { data: deploys };
      },
      {
        params: t.Object({
          serviceId: t.String({ minLength: 1 }),
        }),
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Array(t.Any()),
          }),
        },
        detail: {
          summary: "Get Render service deploys",
          description:
            "Retrieves deployment history for a specific Render service",
          tags: ["deployments"],
        },
      }
    )
    // NPM endpoints
    .get(
      "/npm",
      async ({ query, set }) => {
        if (!query.q) {
          set.status = 400;
          return { error: "Query parameter 'q' is required" };
        }
        const results = await searchNpmPackages(query.q, {
          size: query.size ? Number.parseInt(query.size, 10) : undefined,
          from: query.from ? Number.parseInt(query.from, 10) : undefined,
          quality: query.quality ? Number.parseFloat(query.quality) : undefined,
          popularity: query.popularity
            ? Number.parseFloat(query.popularity)
            : undefined,
          maintenance: query.maintenance
            ? Number.parseFloat(query.maintenance)
            : undefined,
        });
        if (!results) {
          set.status = 500;
          return { error: "Failed to search packages" };
        }
        return { data: results };
      },
      {
        query: t.Object({
          q: t.String({ minLength: 1 }),
          size: t.Optional(t.String()),
          from: t.Optional(t.String()),
          quality: t.Optional(t.String()),
          popularity: t.Optional(t.String()),
          maintenance: t.Optional(t.String()),
        }),
        response: {
          200: t.Object({
            data: t.Any(),
          }),
          400: t.Object({
            error: t.String(),
          }),
          500: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Search NPM packages",
          description:
            "Searches for npm packages with optional quality, popularity, and maintenance filters",
          tags: ["npm"],
        },
      }
    )
    .get(
      "/npm/:packageName",
      async ({ params, query, set }) => {
        const packageName = params.packageName;
        const latestOnly = query.latest === "true";

        const info = await getNpmPackage(packageName, latestOnly);
        if (!info) {
          set.status = 404;
          return { error: "Package not found" };
        }
        return { data: info };
      },
      {
        params: t.Object({
          packageName: t.String({ minLength: 1 }),
        }),
        query: t.Optional(
          t.Object({
            latest: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Any(),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get NPM package info",
          description:
            "Retrieves information about an npm package. Use latest=true for latest version only.",
          tags: ["npm"],
        },
      }
    )
    .get(
      "/npm/:packageName/downloads",
      async ({ params, query, set }) => {
        const packageName = params.packageName;
        const period =
          (query.period as
            | "last-day"
            | "last-week"
            | "last-month"
            | "last-year") ?? "last-week";

        const downloads = await getNpmPackageDownloads(packageName, period);
        if (!downloads) {
          set.status = 404;
          return { error: "Package not found or download stats unavailable" };
        }
        return { data: downloads };
      },
      {
        params: t.Object({
          packageName: t.String({ minLength: 1 }),
        }),
        query: t.Optional(
          t.Object({
            period: t.Optional(
              t.Union([
                t.Literal("last-day"),
                t.Literal("last-week"),
                t.Literal("last-month"),
                t.Literal("last-year"),
              ])
            ),
          })
        ),
        response: {
          200: t.Object({
            data: t.Any(),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get NPM package downloads",
          description:
            "Retrieves download statistics for an npm package for a specified time period",
          tags: ["npm"],
        },
      }
    )
    .get(
      "/npm/:packageName/versions/:version",
      async ({ params, set }) => {
        const { packageName, version } = params;

        const info = await getNpmPackageVersion(packageName, version);
        if (!info) {
          set.status = 404;
          return { error: "Package version not found" };
        }
        return { data: info };
      },
      {
        params: t.Object({
          packageName: t.String({ minLength: 1 }),
          version: t.String({ minLength: 1 }),
        }),
        response: {
          200: t.Object({
            data: t.Any(),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get NPM package version",
          description:
            "Retrieves information about a specific version of an npm package",
          tags: ["npm"],
        },
      }
    )
    .get(
      "/files",
      async ({ request }) => {
        const data = await fetchFilesData();
        const prefersHtml = (request.headers.get("accept") ?? "").includes(
          "text/html"
        );

        if (prefersHtml) {
          return new Response(objectToLinks("/files", data), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        return data;
      },
      {
        response: {
          200: t.Union([
            t.String({ description: "HTML links" }),
            t.Record(t.String(), t.Any()),
          ]),
        },
        detail: {
          summary: "File structure navigation",
          description:
            "Returns file structure across all repositories. Supports HTML and JSON responses.",
          tags: ["files"],
        },
      }
    )
    .get(
      "/files/refresh",
      async ({ set }) => {
        await refreshFilesData();
        set.status = 302;
        set.headers.Location = "/files";
        return new Response(null, { status: 302 });
      },
      {
        response: {
          302: t.Null(),
        },
        detail: {
          summary: "Refresh file structure data",
          description:
            "Refreshes cached file structure and redirects to /files",
          tags: ["files"],
        },
      }
    )
    .get(
      "/files/*",
      async ({ params, request, set }) => {
        try {
          const path = params["*"];
          if (!path) {
            set.status = 404;
            return { error: "Path not found" };
          }

          const data = await fetchFilesData();
          const pathSegments = path.split("/").filter(Boolean);
          const result = getFileAtPath(data, pathSegments);

          if (result === null || result === undefined) {
            set.status = 404;
            return { error: "File or directory not found" };
          }

          const prefersHtml = (request.headers.get("accept") ?? "").includes(
            "text/html"
          );

          if (prefersHtml) {
            if (
              typeof result === "object" &&
              result !== null &&
              !Array.isArray(result)
            ) {
              // Directory
              return new Response(
                objectToLinks(
                  `/files/${path}`,
                  result as Record<string, unknown>
                ),
                {
                  headers: { "content-type": "text/html; charset=utf-8" },
                }
              );
            } else if (typeof result === "string") {
              // File content or URL
              if (isUrl(result)) {
                // GitHub link
                return new Response(
                  `<a href="${result}">${
                    pathSegments[pathSegments.length - 1]
                  }</a>`,
                  {
                    headers: { "content-type": "text/html; charset=utf-8" },
                  }
                );
              } else {
                // File content
                return new Response(result, {
                  headers: { "content-type": "text/plain; charset=utf-8" },
                });
              }
            }
          }

          // JSON response
          if (typeof result === "string" && isUrl(result)) {
            return { file: result };
          }
          return result;
        } catch (error) {
          set.status = 500;
          console.error(
            `Error in /files/*: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          const prefersHtml = (request.headers.get("accept") ?? "").includes(
            "text/html"
          );
          if (prefersHtml) {
            return new Response(renderErrorHtml(500, "Internal Server Error"), {
              status: 500,
              headers: { "content-type": "text/html; charset=utf-8" },
            });
          }
          return {
            error: "INTERNAL_ERROR",
            message:
              error instanceof Error ? error.message : "Unexpected error",
          };
        }
      },
      {
        params: t.Object({
          "*": t.String(),
        }),
        response: {
          200: t.Union([
            t.String({ description: "HTML or plain text content" }),
            t.Any(),
          ]),
          404: t.Any(),
          500: t.Any(),
        },
        detail: {
          summary: "Navigate file structure",
          description:
            "Navigate through repository file structures. Returns HTML or JSON based on Accept header.",
          tags: ["files"],
        },
      }
    )
    .get(
      "/repos",
      async ({ query, request }) => {
        const type = query.type || "public";
        const fieldsParam = query.fields || "";
        const sort = query.sort || "updated";
        const limit = parseInt(query.limit || "100", 10);
        const offset = parseInt(query.offset || "0", 10);

        const fieldsList = parseCommaSeparatedList(fieldsParam);

        const repos = await getRepositories(type);
        if (!repos) {
          return {
            data: [],
            meta: { total: 0, limit, offset, hasMore: false },
          };
        }

        // Format repos
        let formattedRepos = repos.map((repo) =>
          formatBasicRepo(repo as unknown as GitHubRepo)
        ) as Array<
          Record<string, unknown> & {
            owner?: { login?: string };
            name?: string;
          }
        >;

        // Apply field selection if specified
        if (fieldsList.length > 0) {
          formattedRepos = formattedRepos.map((repo) =>
            selectFields(repo, fieldsList)
          ) as typeof formattedRepos;
        }

        // Sort
        formattedRepos = sortRepos(formattedRepos, sort);

        // Paginate
        const result = paginate(formattedRepos, limit, offset);

        const prefersHtml = (request.headers.get("accept") ?? "").includes(
          "text/html"
        );

        if (prefersHtml) {
          const links = result.data
            .map(
              (repo) =>
                `<a href="/repos/${
                  (repo.owner as { login?: string })?.login || "unknown"
                }/${repo.name || "unknown"}">${repo.name || "unknown"}</a><br>`
            )
            .join("");
          return new Response(`<html><body>${links}</body></html>`, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        return result as {
          data: unknown[];
          meta: {
            total: number;
            limit: number;
            offset: number;
            hasMore: boolean;
          };
        };
      },
      {
        query: t.Optional(
          t.Object({
            type: t.Optional(
              t.Union([
                t.Literal("all"),
                t.Literal("public"),
                t.Literal("private"),
              ])
            ),
            include: t.Optional(t.String()),
            fields: t.Optional(t.String()),
            sort: t.Optional(
              t.Union([
                t.Literal("updated"),
                t.Literal("stars"),
                t.Literal("name"),
              ])
            ),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Any(),
        },
        detail: {
          summary: "List repositories",
          description:
            "List repositories with optional filtering, field selection, sorting, and pagination",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo",
      async ({ params, query, request, set }) => {
        const { owner, repo } = params;
        const includeParam = query.include || "";
        const fieldsParam = query.fields || "";

        const includeList = parseCommaSeparatedList(includeParam);
        const fieldsList = parseCommaSeparatedList(fieldsParam);

        const options =
          includeList.length > 0
            ? convertIncludeListToOptions(includeList)
            : {
                includeReadme: true,
                includeLanguages: true,
                includeStats: true,
                includeReleases: true,
                includeWorkflows: true,
                includeCICD: true,
                includeDeployments: true,
                includeNpm: true,
                includeDeploymentLinks: true,
              };

        const repoData = await fetchEnhancedRepositoryData(
          repo,
          owner,
          options
        );

        if (!repoData) {
          set.status = 404;
          return {
            error: "Repository not found",
            message: `Repository ${owner}/${repo} not found or not accessible`,
          };
        }

        let result = repoData as Record<string, unknown>;

        // Apply field selection if specified
        if (fieldsList.length > 0) {
          result = selectFields(result, fieldsList);
        }

        // Add links to nested resources
        if (!fieldsList.length || fieldsList.includes("_links")) {
          result._links = {
            readme: `/repos/${owner}/${repo}/readme`,
            languages: `/repos/${owner}/${repo}/languages`,
            stats: `/repos/${owner}/${repo}/stats`,
            releases: `/repos/${owner}/${repo}/releases`,
            workflows: `/repos/${owner}/${repo}/workflows`,
            cicd: `/repos/${owner}/${repo}/cicd`,
            deployments: `/repos/${owner}/${repo}/deployments`,
            npm: `/repos/${owner}/${repo}/npm`,
            "deployment-links": `/repos/${owner}/${repo}/deployment-links`,
          };
        }

        const prefersHtml = (request.headers.get("accept") ?? "").includes(
          "text/html"
        );

        if (prefersHtml) {
          const html = `
            <html>
              <body>
                <h1>${String(result.name || "")}</h1>
                <p>${String(result.description || "")}</p>
                <ul>
                  <li><a href="${String(result.html_url || "")}">GitHub</a></li>
                  ${
                    result._links
                      ? Object.entries(result._links as Record<string, string>)
                          .map(
                            ([key, url]) =>
                              `<li><a href="${url}">${key}</a></li>`
                          )
                          .join("")
                      : ""
                  }
                </ul>
              </body>
            </html>
          `;
          return new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        return { data: result } as { data: Record<string, unknown> };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        query: t.Optional(
          t.Object({
            include: t.Optional(t.String()),
            fields: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Any(),
          404: t.Object({
            error: t.String(),
            message: t.String(),
          }),
        },
        detail: {
          summary: "Get repository details",
          description: "Get detailed information about a specific repository",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/readme",
      async ({ params, request, set }) => {
        const { owner, repo } = params;
        const readme = await fetchReadme(repo, owner);

        if (!readme) {
          set.status = 404;
          return { error: "README not found" };
        }

        const prefersHtml = (request.headers.get("accept") ?? "").includes(
          "text/html"
        );

        if (prefersHtml) {
          return new Response(
            `<html><body><pre>${readme}</pre></body></html>`,
            {
              headers: { "content-type": "text/html; charset=utf-8" },
            }
          );
        }

        return { data: { readme } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        response: {
          200: t.Any(),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get README",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/languages",
      async ({ params, set }) => {
        const { owner, repo } = params;
        const languages = await fetchRepositoryLanguages(repo, owner);

        if (!languages) {
          set.status = 404;
          return { error: "Languages not found" };
        }

        return { data: { languages } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        response: {
          200: t.Object({
            data: t.Object({
              languages: t.Record(t.String(), t.Number()),
            }),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get language statistics",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/stats",
      async ({ params, query }) => {
        const { owner, repo } = params;
        const includeParam = query.include || "";
        const includeList = parseCommaSeparatedList(includeParam);

        const stats: Record<string, unknown> = {};

        if (!includeList.length || includeList.includes("commit_activity")) {
          stats.commit_activity = await fetchCommitActivity(repo, owner);
        }
        if (!includeList.length || includeList.includes("contributors")) {
          stats.contributors = await fetchContributorStats(repo, owner);
        }
        if (!includeList.length || includeList.includes("code_frequency")) {
          stats.code_frequency = await fetchCodeFrequency(repo, owner);
        }
        if (!includeList.length || includeList.includes("participation")) {
          stats.participation = await fetchParticipation(repo, owner);
        }

        return { data: { stats } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        query: t.Optional(
          t.Object({
            include: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Object({
              stats: t.Any(),
            }),
          }),
        },
        detail: {
          summary: "Get contribution statistics",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/releases",
      async ({ params, query }) => {
        const { owner, repo } = params;
        const limit = parseInt(query.limit || "10", 10);
        const releases = await fetchReleases(repo, owner, limit);

        return { data: { releases: releases || [] } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Object({
              releases: t.Array(t.Any()),
            }),
          }),
        },
        detail: {
          summary: "Get releases",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/workflows",
      async ({ params, set }) => {
        const { owner, repo } = params;
        const workflows = await fetchWorkflows(repo, owner);

        if (!workflows) {
          set.status = 404;
          return { error: "Workflows not found" };
        }

        return { data: { workflows } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        response: {
          200: t.Object({
            data: t.Object({
              workflows: t.Array(t.Any()),
            }),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get GitHub Actions workflows",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/workflows/runs",
      async ({ params, query }) => {
        const { owner, repo } = params;
        const limit = parseInt(query.limit || "10", 10);
        const workflowRuns = await fetchWorkflowRuns(repo, owner, limit);

        return { data: { workflow_runs: workflowRuns || null } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Object({
              workflow_runs: t.Union([t.Any(), t.Null()]),
            }),
          }),
        },
        detail: {
          summary: "Get workflow runs",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/cicd",
      async ({ params, set }) => {
        const { owner, repo } = params;
        const cicdStatus = await fetchCICDStatus(repo, owner);

        if (!cicdStatus) {
          set.status = 404;
          return { error: "CI/CD status not found" };
        }

        return { data: { cicd_status: cicdStatus } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        response: {
          200: t.Object({
            data: t.Object({
              cicd_status: t.Any(),
            }),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get CI/CD status",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/deployments",
      async ({ params, query }) => {
        const { owner, repo } = params;
        const limit = parseInt(query.limit || "10", 10);
        const deployments = await fetchDeployments(repo, owner, limit);

        return { data: { deployments: deployments || [] } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        query: t.Optional(
          t.Object({
            limit: t.Optional(t.String()),
          })
        ),
        response: {
          200: t.Object({
            data: t.Object({
              deployments: t.Array(t.Any()),
            }),
          }),
        },
        detail: {
          summary: "Get deployments",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/npm",
      async ({ params, set }) => {
        const { owner, repo } = params;
        const npmInfo = await fetchNpmPackageInfo(repo, owner);

        if (!npmInfo) {
          set.status = 404;
          return { error: "NPM package info not found" };
        }

        return { data: { npm: npmInfo } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        response: {
          200: t.Object({
            data: t.Object({
              npm: t.Any(),
            }),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get NPM package information",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/repos/:owner/:repo/deployment-links",
      async ({ params, set }) => {
        const { owner, repo } = params;
        const deploymentLinks = await fetchDeploymentLinks(repo, owner);

        if (!deploymentLinks) {
          set.status = 404;
          return { error: "Deployment links not found" };
        }

        return { data: { deployment_links: deploymentLinks } };
      },
      {
        params: t.Object({
          owner: t.String(),
          repo: t.String(),
        }),
        response: {
          200: t.Object({
            data: t.Object({
              deployment_links: t.Any(),
            }),
          }),
          404: t.Object({
            error: t.String(),
          }),
        },
        detail: {
          summary: "Get deployment links",
          tags: ["repos"],
        },
      }
    )
    .get(
      "/api/user",
      async () => {
        // Return username from env for frontend to use
        return { username: env.USERNAME };
      },
      {
        response: {
          200: t.Object({
            username: t.String(),
          }),
        },
        detail: {
          summary: "Get current user",
          tags: ["app"],
        },
      }
    )
    .get(
      "/health",
      () => {
        return new Response("ok", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
      {
        response: {
          200: t.Object({
            status: t.Literal("ok"),
          }),
        },
        detail: {
          summary: "Health check",
          tags: ["app"],
        },
      }
    )
    .onError(({ code, error, request, set }) => {
      const status = code === "NOT_FOUND" ? 404 : 500;
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      set.status = status;
      const prefersHtml = (request.headers.get("accept") ?? "").includes(
        "text/html"
      );

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
    .all("*", ({ request, set }) => {
      set.status = 404;
      const prefersHtml = (request.headers.get("accept") ?? "").includes(
        "text/html"
      );

      if (prefersHtml) {
        return new Response(renderErrorHtml(404, "Not Found"), {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      return {
        error: "NOT_FOUND",
        message: "Route not found",
      };
    });

// Note: createApp is async due to await staticPlugin() for Fullstack Dev Server
// Tests should import createApp and await it

if (import.meta.main) {
  // Use constructor configuration for port; pass empty options if none.
  const appInstance = await createApp();
  const listenOptions = env.PORT ? { port: env.PORT } : {};
  const instance = appInstance.listen(listenOptions);
  const host = instance.server?.hostname ?? "localhost";
  const port = instance.server?.port ?? env.PORT ?? "unknown";
  console.log(`🦊 Elysia is running at http://${host}:${port}`);
}
