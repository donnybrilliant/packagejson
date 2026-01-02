import { openapi } from "@elysiajs/openapi";
import { Elysia, t } from "elysia";
import { cache } from "@/cache";
import { env } from "@/env";
import { loggingPlugin } from "@/plugins/logging";
import { negotiationPlugin } from "@/plugins/negotiation";
import { usingBuiltinSemver } from "@/semver";

const LINKS = [
  { href: "/package.json", label: "package.json" },
  { href: "/repos", label: "repos" },
  { href: "/files", label: "files" },
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

export const createApp = () =>
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
    .get(
      "/",
      ({ request }) => {
        const prefersHtml = (request.headers.get("accept") ?? "").includes(
          "text/html"
        );

        if (prefersHtml) {
          return new Response(renderLinksHtml(), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        return { links: LINKS };
      },
      {
        response: {
          200: t.Union([
            t.String({ description: "HTML list of links" }),
            t.Object({
              links: t.Array(
                t.Object({
                  href: t.String(),
                  label: t.String(),
                })
              ),
            }),
          ]),
        },
        detail: {
          summary: "Root links",
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

export const app = createApp();

if (import.meta.main) {
  // Use constructor configuration for port; pass empty options if none.
  const listenOptions = env.PORT ? { port: env.PORT } : {};
  const instance = app.listen(listenOptions);
  const host = instance.server?.hostname ?? "localhost";
  const port = instance.server?.port ?? env.PORT ?? "unknown";
  console.log(`🦊 Elysia is running at http://${host}:${port}`);
}
