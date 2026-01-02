import path from "node:path";

type Boolish = string | number | boolean | undefined | null;

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

const ROOT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);

const NODE_ENV = Bun.env.NODE_ENV ?? "development";

export const env = {
  PORT: toNumber(Bun.env.PORT),
  NODE_ENV,
  USERNAME: Bun.env.USERNAME ?? "",
  GITHUB_TOKEN: Bun.env.GITHUB_TOKEN,
  NETLIFY_TOKEN: Bun.env.NETLIFY_TOKEN,
  VERCEL_TOKEN: Bun.env.VERCEL_TOKEN,
  RENDER_TOKEN: Bun.env.RENDER_TOKEN,
  USE_LOCAL_DATA: toBool(Bun.env.USE_LOCAL_DATA, NODE_ENV === "development"),
  SAVE_FILE: toBool(Bun.env.SAVE_FILE, NODE_ENV === "development"),
  DATA_JSON_PATH: path.resolve(ROOT_DIR, "data.json"),
};

export const CACHE_TTLS = {
  short: 5 * 60_000, // 5 minutes
  medium: 60 * 60_000, // 1 hour
  long: 24 * 60 * 60_000, // 1 day
  extended: 7 * 24 * 60 * 60_000, // 1 week
};

export type Env = typeof env;
