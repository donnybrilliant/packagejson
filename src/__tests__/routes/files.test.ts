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

describe("Files Service", () => {
  describe("GET /files", () => {
    test("returns v1-style JSON tree by default", async () => {
      const request = createRequest("/files", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);

      const body = await parseJson<Record<string, unknown>>(response);
      expect(typeof body).toBe("object");
      expect(body).toHaveProperty("test-repo");
    });

    test("returns terminal FileSystemItem tree with format=terminal", async () => {
      const request = createRequest("/files?format=terminal", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);

      const body = await parseJson<{
        name: string;
        type: string;
        children?: Array<{ name: string; type: string; children?: unknown[] }>;
      }>(response);

      expect(body.name).toBe("~");
      expect(body.type).toBe("directory");
      expect(Array.isArray(body.children)).toBe(true);
      expect(body.children?.map((child) => child.name)).toEqual(["github", "projects"]);
    });

    test("returns HTML when Accept prefers text/html", async () => {
      const request = createRequest("/files", {
        headers: { accept: "text/html" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectHtmlContent(response);
      const body = await parseText(response);
      expect(body).toContain("test-repo");
    });

    test("includes cache headers and supports conditional requests for JSON", async () => {
      const first = await handleRequest(
        createRequest("/files", {
          headers: { accept: "application/json" },
        })
      );

      expectStatus(first, 200);
      const etag = first.headers.get("etag");
      expect(etag).toBeTruthy();
      expect(first.headers.get("cache-control")).toContain("public");

      const second = await handleRequest(
        createRequest("/files", {
          headers: {
            accept: "application/json",
            "if-none-match": etag ?? "",
          },
        })
      );

      expectStatus(second, 304);
    });
  });

  describe("GET /files/refresh", () => {
    test("redirects to /files", async () => {
      const request = createRequest("/files/refresh");
      const response = await handleRequest(request);

      expectStatus(response, 302);
      expect(response.headers.get("location")).toBe("/files");
    });
  });

  describe("GET /files/*", () => {
    test("returns nested object for directory path", async () => {
      const request = createRequest("/files/test-repo/src", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);
      const body = await parseJson<Record<string, unknown>>(response);
      expect(body["index.ts"]).toBeDefined();
    });

    test("returns file content for file path", async () => {
      const request = createRequest("/files/test-repo/src/index.ts", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseText(response);
      expect(body).toContain("export default");
    });

    test("supports URL-encoded path segments", async () => {
      const request = createRequest("/files/test-repo/docs%2Freadme.md", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseText(response);
      expect(body).toContain("hello docs");
    });

    test("returns strict 404 for non-existent path", async () => {
      const request = createRequest("/files/non-existent", {
        headers: { accept: "application/json" },
      });
      const response = await handleRequest(request);

      expectStatus(response, 404);
      expectJsonContent(response);
      const body = await parseJson<{ error: string }>(response);
      expect(body.error).toBe("File or directory not found");
    });
  });
});
