import { describe, expect, test } from "bun:test";
import {
  createRequest,
  expectHtmlContent,
  expectJsonContent,
  expectStatus,
  handleRequest,
  parseJson,
  parseText,
} from "../helpers/test-utils";

describe("Root Routes", () => {
  describe("GET /", () => {
    test("returns HTML when Accept prefers text/html", async () => {
      const request = createRequest("/", {
        headers: { accept: "text/html" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectHtmlContent(response);

      const body = await parseText(response);
      expect(body).toContain("/package.json");
      expect(body).toContain("/repos");
    });

    test("returns JSON when Accept prefers JSON", async () => {
      const request = createRequest("/", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);

      const body = await parseJson<{ links: unknown[] }>(response);
      expect(Array.isArray(body.links)).toBe(true);
      expect(body.links.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe("GET /docs", () => {
    test("serves OpenAPI UI", async () => {
      const request = createRequest("/docs");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const contentType = response.headers.get("content-type") ?? "";
      expect(
        contentType.includes("text/html") ||
          contentType.includes("application/json")
      ).toBe(true);
    });
  });

  describe("GET /health", () => {
    test("returns ok", async () => {
      const request = createRequest("/health");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const contentType = response.headers.get("content-type") ?? "";
      expect(contentType.includes("text/plain")).toBe(true);
      expect(await parseText(response)).toBe("ok");
    });
  });

  describe("GET /api/user", () => {
    test("returns username payload", async () => {
      const request = createRequest("/api/user");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);

      const body = await parseJson<{ username: string }>(response);
      expect(body).toHaveProperty("username");
      expect(typeof body.username).toBe("string");
    });
  });

  describe("404 handling", () => {
    test("returns deterministic 404 payload for unknown routes", async () => {
      const request = createRequest("/does-not-exist");
      const response = await handleRequest(request);

      expectStatus(response, 404);
      expect(await parseText(response)).toBe("NOT_FOUND");
    });

    test("returns the same 404 payload when Accept prefers text/html", async () => {
      const request = createRequest("/does-not-exist", {
        headers: { accept: "text/html" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 404);
      expect(await parseText(response)).toBe("NOT_FOUND");
    });
  });
});
