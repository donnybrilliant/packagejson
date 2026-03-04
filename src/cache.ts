import { env } from "@/env";
import { log } from "@/utils/logger";

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

// Base URL for creating valid Request objects from cache keys
const BASE_URL = "http://cache.local/";

/**
 * File-based cache storage for development mode
 * Directly reads/writes to data.json for persistence
 */
class FileBasedCache {
  private store: Map<string, CacheEnvelope<unknown>> = new Map();
  private writeTimer: Timer | null = null;
  private readonly writeDebounceMs = 500; // Debounce writes by 500ms

  constructor() {
    this.loadFromFile();
  }

  /**
   * Loads cache data from data.json file
   */
  private async loadFromFile(): Promise<void> {
    if (!env.SAVE_FILE) return;

    try {
      const file = Bun.file(env.DATA_JSON_PATH);
      if (!(await file.exists())) {
        log("debug", "data.json does not exist, starting with empty cache");
        return;
      }

      const text = await file.text();
      const data = JSON.parse(text) as Record<string, CacheEnvelope<unknown>>;

      // Filter out expired entries
      const now = Date.now();
      for (const [key, envelope] of Object.entries(data)) {
        if (!envelope.expiresAt || envelope.expiresAt > now) {
          this.store.set(key, envelope);
        }
      }

      log("info", `Loaded ${this.store.size} cache entries from data.json`);
    } catch (error) {
      log("warn", "Failed to load cache from data.json", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Persists cache to data.json file
   * Debounced to avoid excessive file writes
   */
  private async persistToFile(): Promise<void> {
    if (!env.SAVE_FILE) return;

    // Clear existing timer
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }

    // Debounce writes
    this.writeTimer = setTimeout(async () => {
      try {
        const entries: Record<string, CacheEnvelope<unknown>> = {};
        for (const [key, envelope] of this.store.entries()) {
          entries[key] = envelope;
        }

        await Bun.write(env.DATA_JSON_PATH, JSON.stringify(entries, null, 2));

        log("debug", `Persisted ${this.store.size} cache entries to data.json`);
      } catch (error) {
        log("error", "Failed to persist cache to data.json", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.writeDebounceMs);
  }

  /**
   * Gets a value from the cache
   */
  get<T>(key: string): T | null {
    const envelope = this.store.get(key);
    if (!envelope) return null;

    // Check expiration
    if (envelope.expiresAt && Date.now() > envelope.expiresAt) {
      this.store.delete(key);
      this.persistToFile();
      return null;
    }

    return envelope.value as T;
  }

  /**
   * Sets a value in the cache
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    const envelope: CacheEnvelope<T> = { value, expiresAt };
    this.store.set(key, envelope);
    this.persistToFile();
  }

  /**
   * Deletes a value from the cache
   */
  delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.persistToFile();
    }
    return deleted;
  }

  /**
   * Clears all cache entries
   */
  flush(): void {
    this.store.clear();
    this.persistToFile();
  }

  /**
   * Gets all cache keys
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Gets the number of entries in the cache
   */
  size(): number {
    return this.store.size;
  }
}

/**
 * Creates a CacheHandle that wraps the file-based cache
 */
const createFileBasedCacheHandle = (fileCache: FileBasedCache): CacheHandle => {
  return {
    async match(request: RequestInfo) {
      const key = extractCacheKey(request);
      const value = fileCache.get(key);
      if (value === null) return null;

      const envelope = fileCache.get<CacheEnvelope<unknown>>(key);
      if (!envelope) return null;

      return new Response(JSON.stringify(envelope), {
        headers: { "content-type": "application/json" },
      });
    },

    async put(request: RequestInfo, response: Response) {
      const key = extractCacheKey(request);
      const text = await response.text();
      const envelope = JSON.parse(text) as CacheEnvelope<unknown>;
      fileCache.set(
        key,
        envelope.value,
        envelope.expiresAt ? envelope.expiresAt - Date.now() : undefined
      );
    },

    async delete(request: RequestInfo) {
      const key = extractCacheKey(request);
      return fileCache.delete(key);
    },

    async keys() {
      return fileCache
        .keys()
        .map((key) => new Request(`${BASE_URL}${encodeURIComponent(key)}`));
    },
  };
};

/**
 * Extracts the cache key from a Request object
 */
const extractCacheKey = (request: Request | string): string => {
  if (typeof request === "string") {
    return request;
  }

  const url = request.url;

  // If it's from our memory cache, extract the key from the URL
  if (url.startsWith(BASE_URL)) {
    return decodeURIComponent(url.slice(BASE_URL.length));
  }

  // For DOM Cache API, try to extract the key from the URL
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.slice(1) || url;
  } catch {
    return url;
  }
};

/**
 * Creates an in-memory cache (fallback when not using file-based cache)
 */
const createMemoryCache = (): CacheHandle => {
  const store = new Map<string, Response>();

  return {
    async match(request) {
      const key = extractCacheKey(request);
      return store.get(key) ?? null;
    },
    async put(request, response) {
      const key = extractCacheKey(request);
      store.set(key, response.clone());
    },
    async delete(request) {
      const key = extractCacheKey(request);
      return store.delete(key);
    },
    async keys() {
      return Array.from(store.keys()).map(
        (key) => new Request(`${BASE_URL}${encodeURIComponent(key)}`)
      );
    },
  };
};

/**
 * Opens the DOM Cache API (for production/browser environments)
 */
const openCache = async (): Promise<CacheHandle> => {
  if (!hasCacheApi) return createMemoryCache();

  const cache = await (globalThis.caches as CacheStorage).open(CACHE_NAME);

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

// Store file cache instance for direct access when needed
let fileCacheInstance: FileBasedCache | null = null;

/**
 * Initialize cache based on environment
 * In development with SAVE_FILE enabled, use file-based cache
 * Otherwise, use DOM Cache API or memory cache
 */
const cachePromise: Promise<CacheHandle> = (async () => {
  // Use file-based cache in development mode when SAVE_FILE is enabled
  // Skip in test mode to avoid interference with tests
  if (env.SAVE_FILE && env.NODE_ENV === "development") {
    log("info", "Using file-based cache with data.json persistence");
    fileCacheInstance = new FileBasedCache();
    return createFileBasedCacheHandle(fileCacheInstance);
  }

  // Otherwise use DOM Cache API or memory cache
  log("info", "Using standard cache (DOM Cache API or memory)");
  return openCache();
})();

/**
 * Public cache API
 * Automatically persists to data.json in development mode
 */
export const cache = {
  /**
   * Gets a value from the cache
   */
  async get<T>(key: string): Promise<T | null> {
    // If using file-based cache, access it directly for better performance
    if (fileCacheInstance) {
      return fileCacheInstance.get<T>(key);
    }

    // Standard cache API
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

  /**
   * Sets a value in the cache
   * Automatically persists to data.json in development mode
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    // If using file-based cache, access it directly
    if (fileCacheInstance) {
      fileCacheInstance.set(key, value, ttlMs);
      return;
    }

    // Standard cache API
    const cacheHandle = await cachePromise;
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    const body: CacheEnvelope<T> = { value, expiresAt };

    await cacheHandle.put(
      key,
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      })
    );
  },

  /**
   * Deletes a value from the cache
   */
  async del(key: string): Promise<void> {
    // If using file-based cache, access it directly
    if (fileCacheInstance) {
      fileCacheInstance.delete(key);
      return;
    }

    // Standard cache API
    const cacheHandle = await cachePromise;
    await cacheHandle.delete(key);
  },

  /**
   * Clears all cache entries
   */
  async flush(): Promise<void> {
    // If using file-based cache, access it directly
    if (fileCacheInstance) {
      fileCacheInstance.flush();
      return;
    }

    // Standard cache API
    const cacheHandle = await cachePromise;
    const keys = await cacheHandle.keys();
    await Promise.all(keys.map((request) => cacheHandle.delete(request)));
  },
};
