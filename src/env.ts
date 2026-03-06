import path from "node:path";

type Boolish = string | number | boolean | undefined | null;
type EnvSource = Record<string, Boolish>;
type CreateEnvOptions = {
  nodeEnv?: string;
  rootDir?: string;
};

const toBool = (value: Boolish, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y"].includes(normalized);
  }
  return fallback;
};

const toNumber = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const DEFAULT_ROOT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);

export const createEnv = (
  source: EnvSource = Bun.env as EnvSource,
  options: CreateEnvOptions = {}
) => {
  const NODE_ENV =
    options.nodeEnv ??
    (typeof source.NODE_ENV === "string" ? source.NODE_ENV : "development");
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const dataJsonPath =
    typeof source.DATA_JSON_PATH === "string" && source.DATA_JSON_PATH.trim().length > 0
      ? path.resolve(source.DATA_JSON_PATH)
      : path.resolve(rootDir, "data.json");

  const API_KEYS = typeof source.API_KEYS === "string" ? source.API_KEYS : "";
  const API_KEY_REQUIRED =
    API_KEYS.trim().length > 0
      ? toBool(source.API_KEY_REQUIRED, NODE_ENV === "production")
      : false;

  return {
    PORT: toNumber(typeof source.PORT === "string" ? source.PORT : undefined),
    NODE_ENV,
    API_KEYS,
    API_KEY_REQUIRED,
    API_KEY_ALLOW_X_HEADER: toBool(source.API_KEY_ALLOW_X_HEADER, true),
    RATE_LIMIT_ENABLED: toBool(source.RATE_LIMIT_ENABLED, NODE_ENV === "production"),
    RATE_LIMIT_WINDOW_MS:
      toNumber(
        typeof source.RATE_LIMIT_WINDOW_MS === "string"
          ? source.RATE_LIMIT_WINDOW_MS
          : undefined
      ) ?? 60_000,
    RATE_LIMIT_MAX:
      toNumber(typeof source.RATE_LIMIT_MAX === "string" ? source.RATE_LIMIT_MAX : undefined) ??
      120,
    RATE_LIMIT_HEADERS: toBool(source.RATE_LIMIT_HEADERS, true),
    TRUST_PROXY_HEADERS: toBool(source.TRUST_PROXY_HEADERS, false),
    USERNAME: typeof source.USERNAME === "string" ? source.USERNAME : "",
    GITHUB_API_URL:
      typeof source.GITHUB_API_URL === "string"
        ? source.GITHUB_API_URL
        : "https://api.github.com",
    GITHUB_TOKEN:
      typeof source.GITHUB_TOKEN === "string" ? source.GITHUB_TOKEN : undefined,
    NETLIFY_TOKEN:
      typeof source.NETLIFY_TOKEN === "string" ? source.NETLIFY_TOKEN : undefined,
    VERCEL_TOKEN:
      typeof source.VERCEL_TOKEN === "string" ? source.VERCEL_TOKEN : undefined,
    RENDER_TOKEN:
      typeof source.RENDER_TOKEN === "string" ? source.RENDER_TOKEN : undefined,
    NETLIFY_API_URL:
      typeof source.NETLIFY_API_URL === "string"
        ? source.NETLIFY_API_URL
        : "https://api.netlify.com/api/v1",
    VERCEL_API_URL:
      typeof source.VERCEL_API_URL === "string"
        ? source.VERCEL_API_URL
        : "https://api.vercel.com",
    RENDER_API_URL:
      typeof source.RENDER_API_URL === "string"
        ? source.RENDER_API_URL
        : "https://api.render.com/v1",
    CORS_ORIGIN:
      typeof source.CORS_ORIGIN === "string" ? source.CORS_ORIGIN : "*",
    CORS_METHODS:
      typeof source.CORS_METHODS === "string"
        ? source.CORS_METHODS
        : "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    CORS_HEADERS:
      typeof source.CORS_HEADERS === "string"
        ? source.CORS_HEADERS
        : "Content-Type,Authorization,Accept",
    CORS_EXPOSE_HEADERS:
      typeof source.CORS_EXPOSE_HEADERS === "string" ? source.CORS_EXPOSE_HEADERS : "",
    CORS_ALLOW_CREDENTIALS: toBool(source.CORS_ALLOW_CREDENTIALS, false),
    CORS_MAX_AGE:
      toNumber(typeof source.CORS_MAX_AGE === "string" ? source.CORS_MAX_AGE : undefined) ??
      86_400,
    USE_LOCAL_DATA: toBool(source.USE_LOCAL_DATA, NODE_ENV === "development"),
    SAVE_FILE: toBool(source.SAVE_FILE, NODE_ENV === "development"),
    /** When true, file tree stores GitHub links for files; when false, stores content (v1 parity) */
    ONLY_SAVE_LINKS: toBool(source.ONLY_SAVE_LINKS, true),
    DATA_JSON_PATH: dataJsonPath,
  };
};

export const env = createEnv();

export const CACHE_TTLS = {
  short: 5 * 60_000, // 5 minutes
  medium: 60 * 60_000, // 1 hour
  long: 24 * 60 * 60_000, // 1 day
  extended: 7 * 24 * 60 * 60_000, // 1 week
};

export type Env = typeof env;
