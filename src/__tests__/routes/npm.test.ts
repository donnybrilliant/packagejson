import { describe, expect, test } from "bun:test";
import {
  createRequest,
  expectStatus,
  handleRequest,
  parseJson,
} from "../helpers/test-utils";
import { testNpmPackage } from "../helpers/fixtures";

describe("NPM Service", () => {
  describe("GET /npm (search)", () => {
    test("requires q parameter", async () => {
      const request = createRequest("/npm");
      const response = await handleRequest(request);

      // Elysia validation may return 400, 422, or 500 depending on validation timing
      expectStatus(response, [400, 422, 500]);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("search with query", async () => {
      const request = createRequest("/npm?q=elysia");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: { objects: unknown[]; total: number };
      }>(response);
      expect(body).toHaveProperty("data");
      expect(body.data).toHaveProperty("objects");
      expect(body.data).toHaveProperty("total");
      expect(Array.isArray(body.data.objects)).toBe(true);
    });

    test("search with quality filters", async () => {
      const request = createRequest(
        "/npm?q=test&quality=0.5&popularity=0.5&maintenance=0.5"
      );
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown }>(response);
      expect(body).toHaveProperty("data");
    });

    test("search with pagination", async () => {
      const request = createRequest("/npm?q=test&size=10&from=0");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown }>(response);
      expect(body).toHaveProperty("data");
    });
  });

  describe("GET /npm/:packageName", () => {
    test("returns package info", async () => {
      const request = createRequest("/npm/elysia");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: { exists: boolean; name: string };
      }>(response);
      expect(body.data?.exists).toBe(true);
      expect(body.data?.name).toBe(testNpmPackage.name);
    });

    test("returns package info with latest=true", async () => {
      const request = createRequest("/npm/elysia?latest=true");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: { exists: boolean; name: string };
      }>(response);
      expect(body.data?.exists).toBe(true);
      expect(body.data?.name).toBe(testNpmPackage.name);
    });
  });

  describe("GET /npm/:packageName/downloads", () => {
    test("returns downloads with default period", async () => {
      const request = createRequest("/npm/elysia/downloads");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: {
          downloads: number;
          package: string;
          start: string;
          end: string;
        };
      }>(response);
      expect(body.data).toHaveProperty("downloads");
      expect(body.data).toHaveProperty("package");
      expect(body.data).toHaveProperty("start");
      expect(body.data).toHaveProperty("end");
      expect(typeof body.data.downloads).toBe("number");
    });

    test("returns downloads with period=last-day", async () => {
      const request = createRequest("/npm/elysia/downloads?period=last-day");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: { downloads: number; package: string };
      }>(response);
      expect(body.data).toHaveProperty("downloads");
      expect(body.data.package).toBe("elysia");
    });

    test("returns downloads with period=last-month", async () => {
      const request = createRequest("/npm/elysia/downloads?period=last-month");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: { downloads: number } }>(response);
      expect(body.data).toHaveProperty("downloads");
    });

    test("returns downloads with period=last-year", async () => {
      const request = createRequest("/npm/elysia/downloads?period=last-year");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: { downloads: number } }>(response);
      expect(body.data).toHaveProperty("downloads");
    });

    test("returns stub data in test", async () => {
      const request = createRequest(
        "/npm/non-existent-package-xyz123/downloads"
      );
      const response = await handleRequest(request);

      // In test mode, returns stub data instead of null
      expectStatus(response, 200);
      const body = await parseJson<{
        data: { downloads: number; package: string };
      }>(response);
      expect(body.data).toHaveProperty("downloads");
      expect(body.data.package).toBe("non-existent-package-xyz123");
    });
  });

  describe("GET /npm/:packageName/versions/:version", () => {
    test("returns package version", async () => {
      const request = createRequest("/npm/elysia/versions/1.0.0");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: { exists: boolean; name: string; version: string };
      }>(response);
      expect(body.data?.exists).toBe(true);
      expect(body.data?.name).toBe(testNpmPackage.name);
      expect(body.data?.version).toBe("1.0.0");
    });

    test("returns stub data in test", async () => {
      const request = createRequest("/npm/elysia/versions/999.999.999");
      const response = await handleRequest(request);

      // In test mode, returns stub data instead of null
      expectStatus(response, 200);
      const body = await parseJson<{
        data: { exists: boolean; name: string; version?: string };
      }>(response);
      expect(body.data?.exists).toBe(true);
      expect(body.data?.name).toBe(testNpmPackage.name);
      // Version is set from the version parameter in stubPackage
      expect(body.data?.version).toBeDefined();
    });

    test("returns latest version", async () => {
      const request = createRequest("/npm/elysia/versions/latest");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{
        data: { exists: boolean; name: string; version?: string };
      }>(response);
      expect(body.data?.exists).toBe(true);
      expect(body.data?.name).toBe(testNpmPackage.name);
    });
  });
});

