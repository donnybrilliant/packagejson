import { describe, expect, test } from "bun:test";
import {
  createSecurityPlugin,
  extractClientIp,
  isApiKeyAllowed,
  isProtectedApiPath,
  parseTokenList,
  readApiKeyFromRequest,
} from "@/plugins/security";

describe("Security plugin helpers", () => {
  test("parseTokenList trims values and removes empty entries", () => {
    expect(parseTokenList("")).toEqual([]);
    expect(parseTokenList(" alpha , , beta,gamma ")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  test("isProtectedApiPath matches only core API prefixes", () => {
    expect(isProtectedApiPath("/package.json")).toBe(true);
    expect(isProtectedApiPath("/files/github/demo")).toBe(true);
    expect(isProtectedApiPath("/repos/alice/demo")).toBe(true);
    expect(isProtectedApiPath("/")).toBe(false);
    expect(isProtectedApiPath("/health")).toBe(false);
    expect(isProtectedApiPath("/docs")).toBe(false);
    expect(isProtectedApiPath("/assets/app.js")).toBe(false);
  });

  test("readApiKeyFromRequest prefers bearer token over x-api-key", () => {
    const request = new Request("http://localhost/repos", {
      headers: {
        "x-api-key": "fallback-key",
      },
    });

    expect(readApiKeyFromRequest(request, "bearer-key", true)).toBe("bearer-key");
  });

  test("readApiKeyFromRequest can use x-api-key fallback", () => {
    const request = new Request("http://localhost/repos", {
      headers: {
        "x-api-key": "fallback-key",
      },
    });

    expect(readApiKeyFromRequest(request, undefined, true)).toBe("fallback-key");
  });

  test("readApiKeyFromRequest can disable x-api-key fallback", () => {
    const request = new Request("http://localhost/repos", {
      headers: {
        "x-api-key": "fallback-key",
      },
    });

    expect(readApiKeyFromRequest(request, undefined, false)).toBeUndefined();
  });

  test("isApiKeyAllowed validates exact key matches", () => {
    const allowedKeys = ["portfolio-key", "site-key"];

    expect(isApiKeyAllowed("portfolio-key", allowedKeys)).toBe(true);
    expect(isApiKeyAllowed("wrong-key", allowedKeys)).toBe(false);
    expect(isApiKeyAllowed(undefined, allowedKeys)).toBe(false);
  });

  test("extractClientIp reads x-forwarded-for first", () => {
    const request = new Request("http://localhost/repos", {
      headers: {
        "x-forwarded-for": "198.51.100.11, 10.0.0.5",
        "x-real-ip": "198.51.100.22",
      },
    });

    const ip = extractClientIp(request, null, true);
    expect(ip).toBe("198.51.100.11");
  });

  test("extractClientIp falls back to requestIP() when headers are absent", () => {
    const request = new Request("http://localhost/repos");
    const server = {
      requestIP: () => ({ address: "203.0.113.44" }),
    };

    const ip = extractClientIp(request, server);
    expect(ip).toBe("203.0.113.44");
  });

  test("extractClientIp ignores proxy headers when trustProxyHeaders=false", () => {
    const request = new Request("http://localhost/repos", {
      headers: {
        "x-forwarded-for": "198.51.100.11, 10.0.0.5",
      },
    });
    const server = {
      requestIP: () => ({ address: "203.0.113.44" }),
    };

    const ip = extractClientIp(request, server, false);
    expect(ip).toBe("203.0.113.44");
  });

  test("throws when API key requirement is enabled without keys", () => {
    expect(() =>
      createSecurityPlugin({
        apiKeys: [],
        apiKeyRequired: true,
      })
    ).toThrow();
  });

  test("throws when rate limit is enabled with invalid max", () => {
    expect(() =>
      createSecurityPlugin({
        apiKeyRequired: false,
        rateLimitEnabled: true,
        rateLimitMax: 0,
      })
    ).toThrow();
  });
});
