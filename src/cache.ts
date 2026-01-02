type CacheEnvelope<T> = {
  value: T;
  expiresAt?: number;
};

type CacheHandle = {
  match: (request: RequestInfo) => Promise<Response | null>;
  put: (request: RequestInfo, response: Response) => Promise<void>;
  delete: (request: RequestInfo) => Promise<boolean>;
  keys: () => Promise<Request[]>;
};

const CACHE_NAME = "packagejson-cache";
const hasCacheApi = typeof globalThis.caches !== "undefined";

import { env } from "@/env";

const createMemoryCache = (): CacheHandle => {
  const store = new Map<string, Response>();

  return {
    async match(request) {
      const key = typeof request === "string" ? request : request.toString();
      return store.get(key) ?? null;
    },
    async put(request, response) {
      const key = typeof request === "string" ? request : request.toString();
      store.set(key, response.clone());
    },
    async delete(request) {
      const key = typeof request === "string" ? request : request.toString();
      return store.delete(key);
    },
    async keys() {
      return Array.from(store.keys()).map((url) => new Request(url));
    },
  };
};

const snapshotHeaders = { "content-type": "application/json" };

const readSnapshot = async (): Promise<
  Record<string, CacheEnvelope<unknown>>
> => {
  try {
    const file = Bun.file(env.DATA_JSON_PATH);
    if (!(await file.exists())) return {};
    const text = await file.text();
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const persistSnapshot = async (cacheHandle: CacheHandle) => {
  if (!env.SAVE_FILE) return;
  const entries: Record<string, CacheEnvelope<unknown>> = {};
  const keys = await cacheHandle.keys();
  for (const request of keys) {
    const key =
      typeof request === "string" ? request : request.url ?? request.toString();
    const res = await cacheHandle.match(key);
    if (!res) continue;
    const envelope = (await res.json()) as CacheEnvelope<unknown>;
    entries[key] = envelope;
  }

  await Bun.write(env.DATA_JSON_PATH, JSON.stringify(entries, null, 2));
};

const openCache = async (): Promise<CacheHandle> => {
  if (!hasCacheApi) return createMemoryCache();

  const cache = await (globalThis.caches as CacheStorage).open(CACHE_NAME);

  // Normalize match to return null instead of undefined for type compatibility
  const normalizeMatch = async (
    request: RequestInfo
  ): Promise<Response | null> => {
    const res = await cache.match(request);
    return res ?? null;
  };

  return {
    match: normalizeMatch,
    put: (request: RequestInfo, response: Response) =>
      cache.put(request, response),
    delete: (request: RequestInfo) => cache.delete(request),
    keys: () => cache.keys().then((k) => Array.from(k)),
  };
};

const cachePromise: Promise<CacheHandle> = (async () => {
  const handle = await openCache();

  if (env.USE_LOCAL_DATA && env.SAVE_FILE) {
    const snapshot = await readSnapshot();
    for (const [key, envelope] of Object.entries(snapshot)) {
      await handle.put(
        key,
        new Response(JSON.stringify(envelope), { headers: snapshotHeaders })
      );
    }
  }

  return handle;
})();

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const cacheHandle = await cachePromise;
    const response = await cacheHandle.match(key);
    if (!response) return null;

    const envelope = (await response.json()) as CacheEnvelope<T>;
    if (envelope.expiresAt && Date.now() > envelope.expiresAt) {
      await cacheHandle.delete(key);
      return null;
    }

    return envelope.value;
  },

  async set<T>(key: string, value: T, ttlMs?: number) {
    const cacheHandle = await cachePromise;
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    const body: CacheEnvelope<T> = { value, expiresAt };

    await cacheHandle.put(
      key,
      new Response(JSON.stringify(body), {
        headers: snapshotHeaders,
      })
    );

    if (env.SAVE_FILE) {
      await persistSnapshot(cacheHandle);
    }
  },

  async del(key: string) {
    const cacheHandle = await cachePromise;
    await cacheHandle.delete(key);

    if (env.SAVE_FILE) {
      await persistSnapshot(cacheHandle);
    }
  },

  async flush() {
    const cacheHandle = await cachePromise;
    const keys = await cacheHandle.keys();
    await Promise.all(keys.map((request) => cacheHandle.delete(request)));

    if (env.SAVE_FILE) {
      await persistSnapshot(cacheHandle);
    }
  },
};
