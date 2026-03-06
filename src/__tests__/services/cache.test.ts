import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCache } from "@/cache";
import type { JsonValue } from "@/types/json";
import { createDataStore } from "@/utils/data-store";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Poll until data.json exists and contains cache[key], or timeout.
 * Persist is fire-and-forget (setTimeout), so we poll instead of a fixed sleep for CI stability.
 */
async function waitForCacheFile(
  dataJsonPath: string,
  key: string,
  maxMs: number = 3000,
  intervalMs: number = 50
): Promise<{ cache?: Record<string, { value?: JsonValue }> }> {
  const deadline = Date.now() + maxMs;
  let lastError: Error | null = null;
  while (Date.now() < deadline) {
    try {
      const raw = await readFile(dataJsonPath, "utf-8");
      const parsed = JSON.parse(raw) as { cache?: Record<string, { value?: JsonValue }> };
      if (parsed.cache?.[key] !== undefined) return parsed;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Cache file did not contain key "${key}" within ${maxMs}ms. Last error: ${lastError?.message ?? "n-a"}`
  );
}

describe("Cache persistence", () => {
  test("persists generic cache into data.json.cache and rehydrates in development", async () => {
    const dir = await mkdtemp(join(tmpdir(), "packagejson-cache-dev-"));
    const dataJsonPath = join(dir, "data.json");

    try {
      const dataStore = createDataStore(dataJsonPath);
      const cacheA = createCache({
        nodeEnv: "development",
        writeDebounceMs: 0,
        readStore: dataStore.readDataStore,
        updateStore: dataStore.updateDataStore,
      });

      await cacheA.set("alpha", { ok: true }, 60_000);
      const raw = await waitForCacheFile(dataJsonPath, "alpha");

      expect(raw.cache?.alpha?.value).toEqual({ ok: true });

      const cacheB = createCache({
        nodeEnv: "development",
        writeDebounceMs: 0,
        readStore: dataStore.readDataStore,
        updateStore: dataStore.updateDataStore,
      });

      expect(await cacheB.get<{ ok: boolean }>("alpha")).toEqual({ ok: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not persist generic cache to data.json in production mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "packagejson-cache-prod-"));
    const dataJsonPath = join(dir, "data.json");

    try {
      const dataStore = createDataStore(dataJsonPath);
      const cache = createCache({
        nodeEnv: "production",
        writeDebounceMs: 0,
        readStore: dataStore.readDataStore,
        updateStore: dataStore.updateDataStore,
      });

      await cache.set("alpha", { ok: true }, 60_000);
      await sleep(5);

      const stored = await dataStore.readDataStore();
      expect(stored.cache).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
