import { cache } from "@/cache";
import { CACHE_TTLS, env } from "@/env";
import { fetchFolderStructure, getRepositories } from "@/services/github";
import { getErrorMessage, isRecord } from "@/utils/errors";
import { log } from "@/utils/logger";
import { readDataStore, updateDataStore } from "@/utils/data-store";

/**
 * Maps repository names to their folder/file structure.
 */
type FilesData = Record<string, unknown>;

export type FileSystemItem = {
  name: string;
  type: "file" | "directory";
  content?: string;
  url?: string;
  children?: FileSystemItem[];
};

const CACHE_KEY = "files";
const KNOWN_NON_VFS_KEYS = new Set([
  "deploymentPlatforms",
  "packageData-min",
  "packageData-max",
  "packageData-minmax",
]);

const isLikelyFilesData = (value: unknown): value is FilesData => {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);
  if (keys.length === 0) return true;

  if (keys.some((key) => KNOWN_NON_VFS_KEYS.has(key))) {
    return false;
  }

  const hasDependencyKeys = keys.includes("dependencies") || keys.includes("devDependencies");
  if (hasDependencyKeys) {
    return false;
  }

  return Object.values(value).some((entry) => isRecord(entry));
};

const isUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const normalizeLoadedFilesData = (raw: unknown): FilesData | null => {
  let current: unknown = raw;

  // Unwrap legacy cache envelopes that were accidentally persisted to data.json.
  for (let i = 0; i < 4; i += 1) {
    if (isRecord(current) && "files" in current) {
      const filesNode = (current as Record<string, unknown>).files;
      if (isRecord(filesNode) && "value" in filesNode && isRecord(filesNode.value)) {
        current = filesNode.value;
        continue;
      }
    }

    if (isRecord(current) && "value" in current && isRecord(current.value)) {
      current = current.value;
      continue;
    }

    break;
  }

  if (!isRecord(current)) {
    return null;
  }

  const keys = Object.keys(current);

  // Reject namespaced root objects (new format wrapper) when no direct VFS payload is present.
  const namespaceKeys = ["cache", "vfs"];
  const onlyNamespaceKeys = keys.length > 0 && keys.every((key) => namespaceKeys.includes(key));
  if (onlyNamespaceKeys) {
    return null;
  }

  // Guard against package aggregation payloads accidentally stored in data.json.
  if (keys.includes("dependencies") && keys.includes("devDependencies") && keys.length <= 3) {
    return null;
  }

  if (!isLikelyFilesData(current)) {
    return null;
  }

  return current as FilesData;
};

export const resolveFilesDataFromDataStore = (
  dataStore: Record<string, unknown>
): FilesData | null => {
  const fromNamespace = normalizeLoadedFilesData(dataStore.vfs);
  if (fromNamespace) {
    return fromNamespace;
  }

  return normalizeLoadedFilesData(dataStore);
};

const getLocalData = async (): Promise<FilesData | null> => {
  try {
    const dataStore = await readDataStore();
    const resolved = resolveFilesDataFromDataStore(dataStore);

    if (resolved && isRecord(dataStore.vfs)) {
      log("info", "Loaded files data from data.json.vfs", {
        path: env.DATA_JSON_PATH,
        repos: Object.keys(resolved).length,
      });
      return resolved;
    }

    if (!resolved) {
      log("warn", "Local data.json exists but does not contain valid VFS data", {
        path: env.DATA_JSON_PATH,
      });
      return null;
    }

    log("info", "Loaded files data from legacy data.json root", {
      path: env.DATA_JSON_PATH,
      repos: Object.keys(resolved).length,
    });

    return resolved;
  } catch (error) {
    log("debug", "Could not load local data.json", {
      error: getErrorMessage(error),
    });
    return null;
  }
};

const saveToDataJson = async (data: FilesData): Promise<void> => {
  if (!env.SAVE_FILE) return;
  try {
    await updateDataStore((dataStore) => {
      dataStore.vfs = data;
    });
    log("info", "Saved files data to data.json", {
      path: env.DATA_JSON_PATH,
      repos: Object.keys(data).length,
    });
  } catch (error) {
    log("error", "Error saving to data.json", {
      error: getErrorMessage(error),
    });
  }
};

export const fetchFilesData = async (): Promise<FilesData> => {
  const cached = await cache.get<FilesData>(CACHE_KEY);
  if (cached && isLikelyFilesData(cached)) {
    return cached;
  }

  if (cached) {
    log("warn", "Discarding stale files cache payload with non-VFS shape");
    await cache.del(CACHE_KEY);
  }

  if (env.NODE_ENV === "test") {
    const data: FilesData = {
      "test-repo": {
        "package.json": '{"name":"@test/test-repo"}',
        "README.md": "# test-repo\nThis repo is used for test fixtures.",
        src: {
          "index.ts": "export default {};",
        },
        "docs/readme.md": "hello docs",
      },
    };

    await cache.set(CACHE_KEY, data, CACHE_TTLS.extended);
    return data;
  }

  if (env.USE_LOCAL_DATA) {
    const localData = await getLocalData();
    if (localData) {
      await cache.set(CACHE_KEY, localData, CACHE_TTLS.extended);
      return localData;
    }

    log("warn", "USE_LOCAL_DATA is enabled but no valid local VFS was found, falling back to remote fetch", {
      path: env.DATA_JSON_PATH,
    });
  }

  const data: FilesData = {};
  const repos = await getRepositories();
  if (repos) {
    for (const repo of repos) {
      const owner = repo.owner?.login ?? repo.full_name.split("/")[0];
      const folderStructure = await fetchFolderStructure(repo.name, "", owner);
      if (folderStructure) {
        data[repo.name] = folderStructure;
      }
    }
  }

  if (!env.USE_LOCAL_DATA && env.SAVE_FILE) {
    await saveToDataJson(data);
  }

  await cache.set(CACHE_KEY, data, CACHE_TTLS.extended);

  return data;
};

export const refreshFilesData = async (): Promise<void> => {
  log("info", "Refreshing files data cache");
  await cache.del(CACHE_KEY);
  await fetchFilesData();
};

export const getFileAtPath = (data: FilesData, pathSegments: string[]): unknown => {
  if (pathSegments.length === 0) {
    return data;
  }

  let current: unknown = data;
  for (const segment of pathSegments) {
    const decoded = decodeURIComponent(segment);
    if (isRecord(current)) {
      current = current[decoded];
      if (current === undefined) {
        return null;
      }
    } else {
      return null;
    }
  }

  return current;
};

const toFileSystemItem = (name: string, value: unknown): FileSystemItem => {
  if (isRecord(value)) {
    const children = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([childName, childValue]) => toFileSystemItem(childName, childValue));

    return {
      name,
      type: "directory",
      children,
    };
  }

  if (typeof value === "string") {
    const item: FileSystemItem = {
      name,
      type: "file",
      content: value,
    };

    if (isUrl(value)) {
      item.url = value;
    }

    return item;
  }

  return {
    name,
    type: "file",
    content: JSON.stringify(value),
  };
};

const createRepoDirectoryItems = (data: FilesData): FileSystemItem[] => {
  return Object.entries(data)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([repoName, repoValue]) => toFileSystemItem(repoName, repoValue));
};

export const toTerminalFileSystem = (data: FilesData): FileSystemItem => {
  return {
    name: "~",
    type: "directory",
    children: [
      {
        name: "github",
        type: "directory",
        children: createRepoDirectoryItems(data),
      },
      {
        name: "projects",
        type: "directory",
        children: createRepoDirectoryItems(data),
      },
    ],
  };
};
