import { bearer } from "@elysiajs/bearer";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

type RequestIpServer = {
  requestIP?: (
    request: Request
  ) => {
    address?: string | null;
  } | null;
} | null;

const PROTECTED_PREFIXES = ["/package.json", "/files", "/repos"] as const;

export type SecurityConfig = {
  apiKeys: string[];
  apiKeyRequired: boolean;
  apiKeyAllowXHeader: boolean;
  trustProxyHeaders: boolean;
  rateLimitEnabled: boolean;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  rateLimitHeaders: boolean;
};

export const parseTokenList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const getPathname = (request: Request): string => {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
};

export const isProtectedApiPath = (pathname: string): boolean =>
  PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

const digestToken = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

const normalizeApiKeys = (apiKeys: string[]): string[] => {
  return [...new Set(apiKeys.map((key) => key.trim()).filter(Boolean))];
};

export const isApiKeyAllowed = (
  providedKey: string | undefined,
  allowedKeys: string[]
): boolean => {
  if (!providedKey || allowedKeys.length === 0) {
    return false;
  }

  const providedDigest = digestToken(providedKey);
  return allowedKeys.some((allowedKey) =>
    timingSafeEqual(providedDigest, digestToken(allowedKey))
  );
};

const isApiKeyDigestAllowed = (
  providedKey: string | undefined,
  allowedDigests: Buffer[]
): boolean => {
  if (!providedKey || allowedDigests.length === 0) {
    return false;
  }

  const providedDigest = digestToken(providedKey);
  return allowedDigests.some((allowedDigest) =>
    timingSafeEqual(providedDigest, allowedDigest)
  );
};

export const readApiKeyFromRequest = (
  request: Request,
  bearerToken: string | undefined,
  allowXHeader: boolean
): string | undefined => {
  const normalizedBearer = bearerToken?.trim();
  if (normalizedBearer) {
    return normalizedBearer;
  }

  if (!allowXHeader) {
    return undefined;
  }

  const fallbackHeader = request.headers.get("x-api-key")?.trim();
  return fallbackHeader || undefined;
};

export const extractClientIp = (
  request: Request,
  server: RequestIpServer,
  trustProxyHeaders = false
): string => {
  if (trustProxyHeaders) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor
        .split(",")
        .map((entry) => entry.trim())
        .find(Boolean);
      if (firstIp) return firstIp;
    }

    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;

    const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
    if (cloudflareIp) return cloudflareIp;
  }

  return server?.requestIP?.(request)?.address ?? "n-a";
};

const unauthorizedResponse = {
  error: "UNAUTHORIZED",
  message: "Missing or invalid API key",
} as const;

export const getDefaultSecurityConfig = (): SecurityConfig => ({
  apiKeys: parseTokenList(env.API_KEYS),
  apiKeyRequired: env.API_KEY_REQUIRED,
  apiKeyAllowXHeader: env.API_KEY_ALLOW_X_HEADER,
  trustProxyHeaders: env.TRUST_PROXY_HEADERS,
  rateLimitEnabled: env.RATE_LIMIT_ENABLED,
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: env.RATE_LIMIT_MAX,
  rateLimitHeaders: env.RATE_LIMIT_HEADERS,
});

const normalizeSecurityConfig = (
  override: Partial<SecurityConfig> = {}
): SecurityConfig => {
  const defaults = getDefaultSecurityConfig();
  return {
    ...defaults,
    ...override,
    apiKeys: normalizeApiKeys(override.apiKeys ?? defaults.apiKeys),
  };
};

const validateSecurityConfig = (config: SecurityConfig): void => {
  if (config.apiKeyRequired && config.apiKeys.length === 0) {
    throw new Error(
      "API key auth is required, but no API keys were configured. Set API_KEYS or disable API key requirement."
    );
  }

  if (config.rateLimitEnabled && config.rateLimitMax <= 0) {
    throw new Error(
      "RATE_LIMIT_MAX must be greater than 0 when RATE_LIMIT_ENABLED is true."
    );
  }

  if (config.rateLimitEnabled && config.rateLimitWindowMs <= 0) {
    throw new Error(
      "RATE_LIMIT_WINDOW_MS must be greater than 0 when RATE_LIMIT_ENABLED is true."
    );
  }
};

export const createSecurityPlugin = (
  override: Partial<SecurityConfig> = {}
) => {
  const config = normalizeSecurityConfig(override);
  validateSecurityConfig(config);

  const allowedDigests = config.apiKeys.map((apiKey) => digestToken(apiKey));

  return new Elysia({ name: "security" })
    .use(bearer())
    .use(
      rateLimit({
        duration: config.rateLimitWindowMs,
        max: config.rateLimitMax,
        headers: config.rateLimitHeaders,
        countFailedRequest: true,
        errorResponse: new Response(
          JSON.stringify({
            error: "RATE_LIMITED",
            message: "Too many requests",
          }),
          {
            status: 429,
            headers: { "content-type": "application/json; charset=utf-8" },
          }
        ),
        skip: (request) => {
          if (!config.rateLimitEnabled) return true;
          if (request.method === "OPTIONS") return true;

          const pathname = getPathname(request);
          return !isProtectedApiPath(pathname);
        },
        generator: (request, server) => {
          const pathname = getPathname(request);
          const ip = extractClientIp(
            request,
            server,
            config.trustProxyHeaders
          );
          return `${pathname}:${ip}`;
        },
      })
    )
    .onBeforeHandle({ as: "global" }, ({ request, bearer, set }) => {
      if (request.method === "OPTIONS") {
        return;
      }

      if (!config.apiKeyRequired) {
        return;
      }

      const pathname = getPathname(request);
      if (!isProtectedApiPath(pathname)) {
        return;
      }

      const apiKey = readApiKeyFromRequest(
        request,
        bearer,
        config.apiKeyAllowXHeader
      );

      if (isApiKeyDigestAllowed(apiKey, allowedDigests)) {
        return;
      }

      set.status = 401;
      set.headers["WWW-Authenticate"] = 'Bearer realm="packagejson"';
      return unauthorizedResponse;
    });
};

export const securityPlugin = createSecurityPlugin();
