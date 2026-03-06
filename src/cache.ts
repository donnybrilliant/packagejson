import { env } from "@/env";
import { isRecord } from "@/utils/errors";
import {
  type DataStore,
  readDataStore,
  updateDataStore,
} from "@/utils/data-store";
import type { JsonValue } from "@/types/json";

type CacheEnvelope<T> = {
  value: T;
  expiresAt?: number;
};

const isExpired = <T>(envelope: CacheEnvelope<T>): boolean => {
  return typeof envelope.expiresAt === "number" && Date.now() > envelope.expiresAt;
};

const readEnvelope = (value: JsonValue | undefined): CacheEnvelope<JsonValue> | null => {
  if (!isRecord(value)) return null;
  if (!("value" in value)) return null;

  const expiresRaw = value.expiresAt;
  const expiresAt = typeof expiresRaw === "number" ? expiresRaw : undefined;

  return {
    value: value.value,
    expiresAt,
  };
};

type CacheConfig = {
  nodeEnv: string;
  writeDebounceMs: number;
  readStore: () => Promise<DataStore>;
  updateStore: (
    updater: (store: DataStore) => void | Promise<void>
  ) => Promise<void>;
};

type CacheClient = {
  get<T extends JsonValue>(key: string): Promise<T | null>;
  set<T extends JsonValue>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  flush(): Promise<void>;
};

export const createCache = (
  config: Partial<CacheConfig> = {}
): CacheClient => {
  const resolvedConfig: CacheConfig = {
    nodeEnv: env.NODE_ENV,
    writeDebounceMs: 300,
    readStore: readDataStore,
    updateStore: updateDataStore,
    ...config,
  };

  const store = new Map<string, CacheEnvelope<JsonValue>>();
  const persistCacheToFile = resolvedConfig.nodeEnv === "development";
  let initialized = false;
  let initializePromise: Promise<void> | null = null;
  let writeTimer: Timer | null = null;

  const serializeCurrentStore = (): Record<string, CacheEnvelope<JsonValue>> => {
    const serialized: Record<string, CacheEnvelope<JsonValue>> = {};

    for (const [key, envelope] of store.entries()) {
      if (isExpired(envelope)) {
        store.delete(key);
        continue;
      }
      serialized[key] = envelope;
    }

    return serialized;
  };

  const persistNow = async (): Promise<void> => {
    if (!persistCacheToFile) return;

    const snapshot = serializeCurrentStore();
    await resolvedConfig.updateStore((dataStore) => {
      dataStore.cache = snapshot;
    });
  };

  const schedulePersist = (): void => {
    if (!persistCacheToFile) return;

    if (writeTimer) {
      clearTimeout(writeTimer);
    }

    writeTimer = setTimeout(() => {
      void persistNow();
    }, resolvedConfig.writeDebounceMs);
  };

  const initializeFromFile = async (): Promise<void> => {
    if (initialized) return;

    if (!persistCacheToFile) {
      initialized = true;
      return;
    }

    const dataStore = await resolvedConfig.readStore();
    const rawCache = isRecord(dataStore.cache) ? dataStore.cache : null;

    if (rawCache) {
      for (const [key, value] of Object.entries(rawCache)) {
        const envelope = readEnvelope(value);
        if (!envelope) continue;
        if (isExpired(envelope)) continue;
        store.set(key, envelope);
      }
    }

    initialized = true;
  };

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    if (!initializePromise) {
      initializePromise = initializeFromFile();
    }
    await initializePromise;
  };

  return {
    async get<T extends JsonValue>(key: string): Promise<T | null> {
      await ensureInitialized();

      const envelope = store.get(key);
      if (!envelope) return null;

      if (isExpired(envelope)) {
        store.delete(key);
        schedulePersist();
        return null;
      }

      return envelope.value as T;
    },

    async set<T extends JsonValue>(key: string, value: T, ttlMs?: number): Promise<void> {
      await ensureInitialized();

      const expiresAt = typeof ttlMs === "number" ? Date.now() + ttlMs : undefined;
      store.set(key, { value, expiresAt });
      schedulePersist();
    },

    async del(key: string): Promise<void> {
      await ensureInitialized();

      store.delete(key);
      schedulePersist();
    },

    async flush(): Promise<void> {
      await ensureInitialized();

      store.clear();
      schedulePersist();
    },
  };
};

export const cache = createCache();
