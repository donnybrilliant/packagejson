import { readFile, rename, writeFile } from "node:fs/promises";
import { env } from "@/env";
import { getErrorMessage, isRecord } from "@/utils/errors";
import { log } from "@/utils/logger";

export type DataStore = {
  cache?: Record<string, unknown>;
  vfs?: Record<string, unknown>;
  [key: string]: unknown;
};

const defaultStore = (): DataStore => ({});

const parseStore = (raw: string): DataStore => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      return parsed as DataStore;
    }
  } catch {
    // ignore parse errors and fallback to empty store
  }
  return defaultStore();
};

export const createDataStore = (dataJsonPath: string) => {
  const writeStoreAtomically = async (store: DataStore): Promise<void> => {
    const tmpPath = `${dataJsonPath}.tmp-${process.pid}-${Date.now()}`;
    const serialized = JSON.stringify(store, null, 2);

    await writeFile(tmpPath, serialized, "utf-8");
    await rename(tmpPath, dataJsonPath);
  };

  let writeQueue: Promise<void> = Promise.resolve();

  const queueWrite = (task: () => Promise<void>): Promise<void> => {
    writeQueue = writeQueue
      .catch(() => {
        // keep queue alive after write failures
      })
      .then(task);
    return writeQueue;
  };

  const readDataStore = async (): Promise<DataStore> => {
    try {
      const raw = await readFile(dataJsonPath, "utf-8");
      return parseStore(raw);
    } catch {
      return defaultStore();
    }
  };

  const updateDataStore = async (
    updater: (store: DataStore) => void | Promise<void>
  ): Promise<void> => {
    await queueWrite(async () => {
      const store = await readDataStore();
      await updater(store);
      await writeStoreAtomically(store);
    });
  };

  const clearDataStoreNamespace = async (
    namespace: "cache" | "vfs"
  ): Promise<void> => {
    await updateDataStore((store) => {
      delete store[namespace];
    }).catch((error) => {
      log("warn", "Failed clearing data-store namespace", {
        namespace,
        path: dataJsonPath,
        error: getErrorMessage(error),
      });
    });
  };

  return {
    readDataStore,
    updateDataStore,
    clearDataStoreNamespace,
  };
};

const defaultDataStore = createDataStore(env.DATA_JSON_PATH);

export const readDataStore = defaultDataStore.readDataStore;
export const updateDataStore = defaultDataStore.updateDataStore;
export const clearDataStoreNamespace = defaultDataStore.clearDataStoreNamespace;
