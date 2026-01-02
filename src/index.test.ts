import { expect, test } from "bun:test";
import { app } from "@/index";

const baseUrl = Bun.env.TEST_BASE_URL ?? "http://localhost";

test("GET / returns HTML when Accept prefers text/html", async () => {
  const response = await app.handle(
    new Request(`${baseUrl}/`, {
      headers: { accept: "text/html" },
    })
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");

  const body = await response.text();
  expect(body).toContain("/package.json");
  expect(body).toContain("/repos");
});

test("GET / returns JSON when Accept prefers JSON", async () => {
  const response = await app.handle(
    new Request(`${baseUrl}/`, {
      headers: { accept: "application/json" },
    })
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");

  const body = await response.json();
  expect(Array.isArray(body.links)).toBe(true);
  expect(body.links.length).toBeGreaterThanOrEqual(6);
});

test("GET /docs serves OpenAPI UI", async () => {
  const response = await app.handle(new Request(`${baseUrl}/docs`));
  expect(response.status).toBe(200);
  const contentType = response.headers.get("content-type") ?? "";
  expect(
    contentType.includes("text/html") ||
      contentType.includes("application/json")
  ).toBe(true);
});

test("GET /health returns ok", async () => {
  const response = await app.handle(new Request(`${baseUrl}/health`));
  expect(response.status).toBe(200);
  const contentType = response.headers.get("content-type") ?? "";
  expect(contentType.includes("text/plain")).toBe(true);
  expect(await response.text()).toBe("ok");
});

test("GET /unknown returns 404", async () => {
  const response = await app.handle(new Request(`${baseUrl}/does-not-exist`));
  expect(response.status).toBe(404);
});
