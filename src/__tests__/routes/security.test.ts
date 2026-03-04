import { cors } from "@elysiajs/cors";
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createSecurityPlugin, type SecurityConfig } from "@/plugins/security";

const defaultSecurityConfig: SecurityConfig = {
  apiKeys: ["portfolio-key"],
  apiKeyRequired: true,
  apiKeyAllowXHeader: true,
  trustProxyHeaders: true,
  rateLimitEnabled: false,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 120,
  rateLimitHeaders: true,
};

const createAppForSecurity = (
  override: Partial<SecurityConfig> = {}
) => {
  const config: SecurityConfig = {
    ...defaultSecurityConfig,
    ...override,
  };

  return new Elysia()
    .use(
      cors({
        origin: "*",
        methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        allowedHeaders: "Content-Type,Authorization,Accept",
        preflight: true,
      })
    )
    .use(createSecurityPlugin(config))
    .get("/repos", () => ({ ok: true }))
    .get("/health", () => "ok");
};

const request = (path: string, init?: RequestInit) =>
  new Request(`http://localhost${path}`, init);

describe("Security routes", () => {
  test("rejects protected route without API key when required", async () => {
    const app = createAppForSecurity();
    const response = await app.handle(request("/repos"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");

    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("accepts protected route with valid bearer API key", async () => {
    const app = createAppForSecurity();
    const response = await app.handle(
      request("/repos", {
        headers: {
          authorization: "Bearer portfolio-key",
        },
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("supports x-api-key fallback when enabled", async () => {
    const app = createAppForSecurity({ apiKeyAllowXHeader: true });
    const response = await app.handle(
      request("/repos", {
        headers: {
          "x-api-key": "portfolio-key",
        },
      })
    );

    expect(response.status).toBe(200);
  });

  test("disables x-api-key fallback when configured", async () => {
    const app = createAppForSecurity({ apiKeyAllowXHeader: false });
    const response = await app.handle(
      request("/repos", {
        headers: {
          "x-api-key": "portfolio-key",
        },
      })
    );

    expect(response.status).toBe(401);
  });

  test("keeps public route available without API key", async () => {
    const app = createAppForSecurity();
    const response = await app.handle(request("/health"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("does not block CORS preflight on protected routes", async () => {
    const app = createAppForSecurity();
    const response = await app.handle(
      request("/repos", {
        method: "OPTIONS",
        headers: {
          origin: "https://portfolio.example.com",
          "access-control-request-method": "GET",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("rate-limits protected routes when enabled", async () => {
    const app = createAppForSecurity({
      apiKeyRequired: false,
      rateLimitEnabled: true,
      rateLimitMax: 1,
      rateLimitWindowMs: 60_000,
    });

    const first = await app.handle(
      request("/repos", {
        headers: {
          "x-forwarded-for": "198.51.100.10",
        },
      })
    );
    const second = await app.handle(
      request("/repos", {
        headers: {
          "x-forwarded-for": "198.51.100.10",
        },
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("ratelimit-limit")).toBe("1");
    expect(second.headers.get("retry-after")).toBe("60");
    expect(await second.json()).toEqual({
      error: "RATE_LIMITED",
      message: "Too many requests",
    });
  });

  test("does not rate-limit public routes", async () => {
    const app = createAppForSecurity({
      apiKeyRequired: false,
      rateLimitEnabled: true,
      rateLimitMax: 1,
      rateLimitWindowMs: 60_000,
    });

    const first = await app.handle(
      request("/health", {
        headers: {
          "x-forwarded-for": "198.51.100.10",
        },
      })
    );
    const second = await app.handle(
      request("/health", {
        headers: {
          "x-forwarded-for": "198.51.100.10",
        },
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
