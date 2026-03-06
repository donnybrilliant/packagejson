import { describe, expect, test } from "bun:test";
import {
  createRequest,
  expectJsonContent,
  expectStatus,
  handleRequest,
  parseJson,
} from "../helpers/test-utils";

describe("Package Service", () => {
  describe("GET /package.json", () => {
    test("returns aggregated data (test stub)", async () => {
      const request = createRequest("/package.json");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);
      const body = await parseJson<{
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      }>(response);
      expect(body).toHaveProperty("dependencies");
      expect(body).toHaveProperty("devDependencies");
      expect(typeof body.dependencies).toBe("object");
      expect(typeof body.devDependencies).toBe("object");
    });

    test("returns aggregated data with version=min", async () => {
      const request = createRequest("/package.json?version=min");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      }>(response);
      expect(body).toHaveProperty("dependencies");
      expect(body).toHaveProperty("devDependencies");
    });

    test("returns aggregated data with version=minmax", async () => {
      const request = createRequest("/package.json?version=minmax");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      }>(response);
      expect(body).toHaveProperty("dependencies");
      expect(body).toHaveProperty("devDependencies");
    });

    test("includes cache headers and supports conditional requests", async () => {
      const first = await handleRequest(createRequest("/package.json"));
      expectStatus(first, 200);

      const etag = first.headers.get("etag");
      expect(etag).toBeTruthy();
      expect(first.headers.get("cache-control")).toContain("public");

      const second = await handleRequest(
        createRequest("/package.json", {
          headers: {
            "if-none-match": etag ?? "",
          },
        })
      );

      expectStatus(second, 304);
    });
  });

  describe("GET /package.json/refresh", () => {
    test("is not available (refresh is POST-only)", async () => {
      const request = createRequest("/package.json/refresh");
      const response = await handleRequest(request);

      expectStatus(response, 404);
    });
  });

  describe("POST /package.json/refresh", () => {
    test("refreshes cache and redirects to /package.json", async () => {
      const request = createRequest("/package.json/refresh", {
        method: "POST",
      });
      const response = await handleRequest(request);

      expectStatus(response, 303);
      expect(response.headers.get("location")).toBe("/package.json?version=max");
    });

    test("supports version parameter when refreshing cache", async () => {
      const request = createRequest("/package.json/refresh?version=min", {
        method: "POST",
      });
      const response = await handleRequest(request);

      expectStatus(response, 303);
      expect(response.headers.get("location")).toBe("/package.json?version=min");
    });
  });
});
