import { describe, expect, test } from "bun:test";
import {
  createRequest,
  expectStatus,
  handleRequest,
  parseJson,
} from "../helpers/test-utils";

describe("Repos Service", () => {
  describe("GET /repos", () => {
    test("returns list (test stub)", async () => {
      const request = createRequest("/repos", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: unknown[];
        meta: unknown;
      }>(response);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("meta");
      expect(Array.isArray(body.data)).toBe(true);
    });

    test("with query parameters", async () => {
      const request = createRequest(
        "/repos?sort=stars&order=desc&limit=10&offset=0&fields=name,stars"
      );
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: unknown[];
        meta: unknown;
      }>(response);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("meta");
    });

    test("with filter parameter", async () => {
      const request = createRequest("/repos?filter=language:TypeScript");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown }>(response);
      expect(body).toHaveProperty("data");
    });
  });

  describe("GET /repos/:owner/:repo", () => {
    test("returns 404 for non-existent repo", async () => {
      const request = createRequest("/repos/test-owner/non-existent-repo", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("with include parameter", async () => {
      const request = createRequest(
        "/repos/test-owner/test-repo?include=readme,languages,stats"
      );
      // Will return 404 in test, but should validate query param handling
      const response = await handleRequest(request);
      expectStatus(response, [404, 500]);
    });
  });

  describe("Nested Resources", () => {
    const nonExistentRepo = "/repos/test-owner/non-existent-repo";

    test("GET /repos/:owner/:repo/readme returns 404", async () => {
      const request = createRequest(`${nonExistentRepo}/readme`, {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /repos/:owner/:repo/languages returns 404", async () => {
      const request = createRequest(`${nonExistentRepo}/languages`);
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /repos/:owner/:repo/stats returns data structure", async () => {
      const request = createRequest(`${nonExistentRepo}/stats`);
      const response = await handleRequest(request);

      // Returns 200 with empty/null stats instead of 404
      expectStatus(response, 200);
      const body = await parseJson<{
        data: { stats: unknown };
      }>(response);
      expect(body).toHaveProperty("data");
      expect(body.data).toHaveProperty("stats");
    });

    test("GET /repos/:owner/:repo/releases returns empty array", async () => {
      const request = createRequest(`${nonExistentRepo}/releases`);
      const response = await handleRequest(request);

      // Returns 200 with empty array instead of 404
      expectStatus(response, 200);
      const body = await parseJson<{
        data: { releases: unknown[] };
      }>(response);
      expect(body).toHaveProperty("data");
      expect(body.data).toHaveProperty("releases");
      expect(Array.isArray(body.data.releases)).toBe(true);
    });

    test("GET /repos/:owner/:repo/workflows returns 404", async () => {
      const request = createRequest(`${nonExistentRepo}/workflows`);
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /repos/:owner/:repo/workflows/runs returns data", async () => {
      const request = createRequest(`${nonExistentRepo}/workflows/runs`);
      const response = await handleRequest(request);

      // Returns 200 with data structure instead of 404
      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown }>(response);
      expect(body).toHaveProperty("data");
    });

    test("GET /repos/:owner/:repo/cicd returns 404", async () => {
      const request = createRequest(`${nonExistentRepo}/cicd`);
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /repos/:owner/:repo/deployments returns data", async () => {
      const request = createRequest(`${nonExistentRepo}/deployments`);
      const response = await handleRequest(request);

      // Returns 200 with data structure instead of 404
      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown }>(response);
      expect(body).toHaveProperty("data");
    });

    test("GET /repos/:owner/:repo/npm returns 404", async () => {
      const request = createRequest(`${nonExistentRepo}/npm`);
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /repos/:owner/:repo/deployment-links returns 404", async () => {
      const request = createRequest(`${nonExistentRepo}/deployment-links`);
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });
  });
});

