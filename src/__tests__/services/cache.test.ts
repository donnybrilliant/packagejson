import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCache } from "@/cache";
import { createDataStore } from "@/utils/data-store";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

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
      await sleep(5);

      const raw = JSON.parse(await readFile(dataJsonPath, "utf-8")) as {
        cache?: Record<string, { value?: unknown }>;
      };

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
