import { describe, expect, test } from "bun:test";
import { createEnv } from "@/env";

describe("Environment defaults", () => {
  test("enables auth and rate limiting defaults in production when API_KEYS is set", () => {
    const env = createEnv(
      { API_KEYS: "key1,key2", NODE_ENV: "production" },
      { nodeEnv: "production", rootDir: "/tmp/packagejson-prod" }
    );

    expect(env.NODE_ENV).toBe("production");
    expect(env.API_KEY_REQUIRED).toBe(true);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
    expect(env.DATA_JSON_PATH).toBe("/tmp/packagejson-prod/data.json");
  });

  test("disables API key requirement in production when API_KEYS is empty so app can start", () => {
    const env = createEnv(
      {},
      { nodeEnv: "production", rootDir: "/tmp/packagejson-prod" }
    );

    expect(env.NODE_ENV).toBe("production");
    expect(env.API_KEYS).toBe("");
    expect(env.API_KEY_REQUIRED).toBe(false);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
  });

  test("keeps local-dev friendly defaults in development", () => {
    const env = createEnv(
      {},
      { nodeEnv: "development", rootDir: "/tmp/packagejson-dev" }
    );

    expect(env.NODE_ENV).toBe("development");
    expect(env.API_KEY_REQUIRED).toBe(false);
    expect(env.RATE_LIMIT_ENABLED).toBe(false);
    expect(env.USE_LOCAL_DATA).toBe(true);
    expect(env.SAVE_FILE).toBe(true);
  });

  test("defaults REPOS_ALLOW_PRIVATE to false", () => {
    const env = createEnv(
      {},
      { nodeEnv: "production", rootDir: "/tmp" }
    );
    expect(env.REPOS_ALLOW_PRIVATE).toBe(false);
  });

  test("respects REPOS_ALLOW_PRIVATE when set to true", () => {
    const env = createEnv(
      { REPOS_ALLOW_PRIVATE: "true" },
      { nodeEnv: "production", rootDir: "/tmp" }
    );
    expect(env.REPOS_ALLOW_PRIVATE).toBe(true);
  });
});
