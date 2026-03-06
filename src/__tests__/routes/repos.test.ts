import { describe, expect, test } from "bun:test";
import type { JsonObject } from "@/types/json";
import {
  createRequest,
  expectJsonContent,
  expectStatus,
  handleRequest,
  parseJson,
} from "../helpers/test-utils";

describe("Repos Service", () => {
  describe("GET /repos", () => {
    test("returns repository collection with pagination metadata", async () => {
      const request = createRequest("/repos", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);

      const body = await parseJson<{
        data: JsonObject[];
        meta: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(response);

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.total).toBeGreaterThan(0);
      expect(body.meta.limit).toBe(100);
      expect(body.meta.offset).toBe(0);
    });

    test("supports fields selection", async () => {
      const request = createRequest("/repos?fields=name,stars");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: JsonObject[] }>(response);

      expect(body.data.length).toBeGreaterThan(0);
      const first = body.data[0];
      expect(Object.keys(first)).toEqual(["name", "stars"]);
    });

    test("supports q search across README and auto-includes enrichment fields", async () => {
      const request = createRequest("/repos?q=nebula", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: JsonObject[] }>(response);

      expect(body.data.length).toBe(1);
      const repo = body.data[0];
      expect(repo.name).toBe("readme-only-repo");
      expect(repo).toHaveProperty("readme");
      expect(repo).toHaveProperty("languages");
      expect(repo).toHaveProperty("deployments");
      expect(repo).toHaveProperty("npm");
      expect(repo).toHaveProperty("deployment_links");
    });

    test("uses explicit include list when include is provided", async () => {
      const request = createRequest("/repos?q=nebula&include=languages", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: JsonObject[] }>(response);

      expect(body.data.length).toBe(1);
      const repo = body.data[0];
      expect(repo).toHaveProperty("languages");
      expect(repo).not.toHaveProperty("readme");
      expect(repo).not.toHaveProperty("deployments");
      expect(repo).not.toHaveProperty("npm");
      expect(repo).not.toHaveProperty("deployment_links");
    });

    test("supports sort and pagination", async () => {
      const request = createRequest("/repos?sort=stars&limit=1&offset=0");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: Array<{ name?: string; stars?: number }>;
        meta: { total: number; limit: number; offset: number; hasMore: boolean };
      }>(response);

      expect(body.data.length).toBe(1);
      expect(body.meta.limit).toBe(1);
      expect(body.meta.offset).toBe(0);
      expect(typeof body.data[0].stars).toBe("number");
    });

    test("includes cache headers and supports conditional requests", async () => {
      const first = await handleRequest(createRequest("/repos"));
      expectStatus(first, 200);

      const etag = first.headers.get("etag");
      expect(etag).toBeTruthy();
      expect(first.headers.get("cache-control")).toContain("public");

      const second = await handleRequest(
        createRequest("/repos", {
          headers: {
            "if-none-match": etag ?? "",
          },
        })
      );

      expectStatus(second, 304);
    });
  });

  describe("GET /repos/:owner/:repo", () => {
    test("returns detailed repository data with default include set", async () => {
      const request = createRequest("/repos/test-owner/test-repo", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: JsonObject }>(response);

      expect(body.data.name).toBe("test-repo");
      expect(body.data).toHaveProperty("readme");
      expect(body.data).toHaveProperty("languages");
      expect(body.data).toHaveProperty("deployments");
      expect(body.data).toHaveProperty("npm");
      expect(body.data).toHaveProperty("deployment_links");
    });

    test("returns 404 for missing repository", async () => {
      const request = createRequest("/repos/test-owner/not-found");
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });
  });

  describe("Nested resources", () => {
    test("GET /repos/:owner/:repo/readme returns README", async () => {
      const response = await handleRequest(createRequest("/repos/test-owner/test-repo/readme"));
      expectStatus(response, 200);
      const body = await parseJson<{ data: { readme: string } }>(response);
      expect(body.data.readme).toContain("test-repo");
    });

    test("GET /repos/:owner/:repo/languages returns language map", async () => {
      const response = await handleRequest(createRequest("/repos/test-owner/test-repo/languages"));
      expectStatus(response, 200);
      const body = await parseJson<{ data: { languages: Record<string, number> } }>(response);
      expect(body.data.languages).toHaveProperty("TypeScript");
    });

    test("GET /repos/:owner/:repo/deployments returns github deployments when present", async () => {
      const response = await handleRequest(
        createRequest("/repos/test-owner/test-repo/deployments")
      );

      expectStatus(response, 200);
      const body = await parseJson<{ data: { deployments: JsonObject[] } }>(
        response
      );
      expect(body.data.deployments.length).toBeGreaterThan(0);
      expect(body.data.deployments[0].source).toBe("github");
    });

    test("GET /repos/:owner/:repo/deployments falls back to external deployments", async () => {
      const response = await handleRequest(
        createRequest("/repos/test-owner/readme-only-repo/deployments")
      );

      expectStatus(response, 200);
      const body = await parseJson<{ data: { deployments: JsonObject[] } }>(
        response
      );
      expect(body.data.deployments.length).toBeGreaterThan(0);
      expect(body.data.deployments[0].source).toBe("external");
    });

    test("GET /repos/:owner/:repo/npm returns exact package lookup info", async () => {
      const response = await handleRequest(createRequest("/repos/test-owner/test-repo/npm"));
      expectStatus(response, 200);
      const body = await parseJson<{
        data: { npm: { package_name: string; npmjs: { exists: boolean } } };
      }>(response);
      expect(body.data.npm.package_name).toBe("@test/test-repo");
      expect(body.data.npm.npmjs.exists).toBe(true);
    });

    test("GET /repos/:owner/:repo/npm returns exists=false for unpublished package", async () => {
      const response = await handleRequest(
        createRequest("/repos/test-owner/readme-only-repo/npm")
      );
      expectStatus(response, 200);
      const body = await parseJson<{
        data: { npm: { package_name: string; npmjs: { exists: boolean } } };
      }>(response);
      expect(body.data.npm.package_name).toBe("@test/missing-package");
      expect(body.data.npm.npmjs.exists).toBe(false);
    });

    test("GET /repos/:owner/:repo/deployment-links returns platform links", async () => {
      const response = await handleRequest(
        createRequest("/repos/test-owner/readme-only-repo/deployment-links")
      );

      expectStatus(response, 200);
      const body = await parseJson<{
        data: {
          deployment_links: {
            netlify: JsonObject | null;
            vercel: JsonObject | null;
            render: JsonObject | null;
          } | null;
        };
      }>(response);

      expect(body.data.deployment_links).not.toBeNull();
      expect(body.data.deployment_links?.vercel).not.toBeNull();
    });
  });
});
