import { describe, expect, test } from "bun:test";
import {
  createRequest,
  expectJsonContent,
  expectStatus,
  handleRequest,
  parseJson,
} from "../helpers/test-utils";

describe("Deployment Services", () => {
  describe("Netlify", () => {
    test("GET /netlify without token returns configured:false", async () => {
      const request = createRequest("/netlify");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);
      const body = await parseJson(response);
      expect(body.configured).toBe(false);
    });

    test("GET /netlify with query parameters", async () => {
      const request = createRequest("/netlify?page=1&per_page=10&sort=name");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<Record<string, unknown>>(response);
      expect(body).toHaveProperty("configured");
    });

    test("GET /netlify/:siteId returns 404 for non-existent site", async () => {
      const request = createRequest("/netlify/non-existent-site-id");
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /netlify/:siteId/deploys returns empty array in test", async () => {
      const request = createRequest("/netlify/test-site-id/deploys");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown[] }>(response);
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
    });

    test("GET /netlify/:siteId/deploys with pagination", async () => {
      const request = createRequest(
        "/netlify/test-site-id/deploys?page=1&per_page=5"
      );
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown[] }>(response);
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("Vercel", () => {
    test("GET /vercel without token returns configured:false", async () => {
      const request = createRequest("/vercel");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);
      const body = await parseJson(response);
      expect(body.configured).toBe(false);
    });

    test("GET /vercel with query parameters", async () => {
      const request = createRequest("/vercel?limit=10&teamId=test-team");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<Record<string, unknown>>(response);
      expect(body).toHaveProperty("configured");
    });

    test("GET /vercel/:projectId returns 404 for non-existent project", async () => {
      const request = createRequest("/vercel/non-existent-project-id");
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /vercel/:projectId with teamId query param", async () => {
      const request = createRequest(
        "/vercel/test-project-id?teamId=test-team"
      );
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /vercel/:projectId/deployments returns empty array in test", async () => {
      const request = createRequest("/vercel/test-project-id/deployments");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown[] }>(response);
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
    });

    test("GET /vercel/:projectId/deployments with query parameters", async () => {
      const request = createRequest(
        "/vercel/test-project-id/deployments?limit=5&target=production"
      );
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown[] }>(response);
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
    });

    test("GET /vercel returns project items with url (not link)", async () => {
      const request = createRequest("/vercel");
      const response = await handleRequest(request);
      expectStatus(response, 200);
      const body = await parseJson<{
        configured?: boolean;
        data?: Array<Record<string, unknown>>;
      }>(response);
      if (body.configured && Array.isArray(body.data) && body.data.length > 0) {
        const first = body.data[0];
        expect(first).toHaveProperty("url");
        expect(first).not.toHaveProperty("link");
      }
    });
  });

  describe("Render", () => {
    test("GET /render without token returns configured:false", async () => {
      const request = createRequest("/render");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      expectJsonContent(response);
      const body = await parseJson(response);
      expect(body.configured).toBe(false);
    });

    test("GET /render with query parameters", async () => {
      const request = createRequest("/render?limit=10&name=test-service");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<Record<string, unknown>>(response);
      expect(body).toHaveProperty("configured");
    });

    test("GET /render/:serviceId returns 404 for non-existent service", async () => {
      const request = createRequest("/render/non-existent-service-id");
      const response = await handleRequest(request);

      expectStatus(response, 404);
      const body = await parseJson<{ error: string }>(response);
      expect(body).toHaveProperty("error");
    });

    test("GET /render/:serviceId/deploys returns empty array in test", async () => {
      const request = createRequest("/render/test-service-id/deploys");
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown[] }>(response);
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
    });

    test("GET /render/:serviceId/deploys with limit", async () => {
      const request = createRequest(
        "/render/test-service-id/deploys?limit=5"
      );
      const response = await handleRequest(request);

      expectStatus(response, 200);
      const body = await parseJson<{ data: unknown[] }>(response);
      expect(body).toHaveProperty("data");
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
});

