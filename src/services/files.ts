import { cache } from "@/cache";
import { CACHE_TTLS, env } from "@/env";
import { fetchFolderStructure, getRepositories } from "@/services/github";
import { getErrorMessage, isRecord } from "@/utils/errors";
import { log } from "@/utils/logger";
import {
  type DataStore,
  readDataStore,
  updateDataStore,
} from "@/utils/data-store";
import type { JsonObject, JsonValue } from "@/types/json";

/**
 * Maps repository names to their folder/file structure.
 */
export type FilesData = JsonObject;

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

const isLikelyFilesData = (value: JsonValue | null): value is FilesData => {
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

/**
 * Converts legacy flat keys (e.g. "docs/readme.md") into nested structure so getFileAtPath works.
 * Old data.json with flat structure still passes isLikelyFilesData but traversal would 404; this
 * normalizes once at load time so both formats work.
 */
const normalizeFlatKeysToNested = (obj: JsonObject): JsonObject => {
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalizedValue = isRecord(value) ? normalizeFlatKeysToNested(value) : value;
    if (key.includes("/")) {
      const parts = key.split("/").filter(Boolean);
      let current = result;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        const existing = current[part];
        if (!isRecord(existing)) {
          current[part] = {};
          current = current[part] as JsonObject;
        } else {
          current = existing as JsonObject;
        }
      }
      const last = parts[parts.length - 1];
      const existingLeaf = current[last];
      if (isRecord(existingLeaf) && isRecord(normalizedValue)) {
        current[last] = { ...normalizeFlatKeysToNested(existingLeaf), ...normalizeFlatKeysToNested(normalizedValue) };
      } else {
        current[last] = normalizedValue;
      }
    } else {
      const existing = result[key];
      if (isRecord(existing) && isRecord(normalizedValue)) {
        result[key] = { ...normalizeFlatKeysToNested(existing), ...normalizeFlatKeysToNested(normalizedValue) };
      } else {
        result[key] = normalizedValue;
      }
    }
  }
  return result;
};

const isUrl = (value: string): boolean => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const normalizeLoadedFilesData = (raw: JsonValue | undefined): FilesData | null => {
  let current: JsonValue | undefined = raw;

  // Unwrap legacy cache envelopes that were accidentally persisted to data.json.
  for (let i = 0; i < 4; i += 1) {
    if (isRecord(current) && "files" in current) {
      const filesNode = (current as JsonObject).files;
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

  return normalizeFlatKeysToNested(current as JsonObject) as FilesData;
};

export const resolveFilesDataFromDataStore = (
  dataStore: DataStore
): FilesData | null => {
  const fromNamespace = normalizeLoadedFilesData(dataStore.vfs);
  if (fromNamespace) {
    return fromNamespace;
  }

  return normalizeLoadedFilesData(dataStore as JsonObject);
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
      return null;
    }

    // Empty root with no vfs namespace means missing/empty data.json; don't treat as valid VFS
    if (
      Object.keys(resolved).length === 0 &&
      !isRecord(dataStore.vfs)
    ) {
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
  if (env.NODE_ENV === "test") {
    const data: FilesData = {
      "test-repo": {
        "package.json": "https://github.com/test-owner/test-repo/blob/main/package.json",
        "README.md": "https://github.com/test-owner/test-repo/blob/main/README.md",
        src: {
          "index.ts": "https://github.com/test-owner/test-repo/blob/main/src/index.ts",
        },
        docs: {
          "readme.md": "https://github.com/test-owner/test-repo/blob/main/docs/readme.md",
          "readme (1).md":
            "https://github.com/test-owner/test-repo/blob/main/docs/readme%20%281%29.md",
        },
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

    await cache.del(CACHE_KEY);
  } else {
    const cached = await cache.get<FilesData>(CACHE_KEY);
    if (cached && isLikelyFilesData(cached)) {
      return normalizeFlatKeysToNested(cached as JsonObject) as FilesData;
    }

    if (cached) {
      log("warn", "Discarding stale files cache payload with non-VFS shape");
      await cache.del(CACHE_KEY);
    }
  }

  const data: FilesData = {};
  const repos = await getRepositories(env.REPOS_ALLOW_PRIVATE ? "all" : "public");
  if (repos) {
    for (const repo of repos) {
      const owner = repo.owner?.login ?? repo.full_name.split("/")[0];
      const defaultBranch =
        typeof repo.default_branch === "string" && repo.default_branch.length > 0
          ? repo.default_branch
          : "HEAD";
      const folderStructure = await fetchFolderStructure(repo.name, "", owner, defaultBranch);
      data[repo.name] = folderStructure && isRecord(folderStructure) ? folderStructure : {};
    }
  }

  if (env.SAVE_FILE) {
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

export const getFileAtPath = (
  data: FilesData,
  pathSegments: string[]
): JsonValue | null => {
  if (pathSegments.length === 0) {
    return data;
  }

  let current: JsonValue = data;
  for (const segment of pathSegments) {
    const decodedParts = decodeURIComponent(segment).split("/").filter(Boolean);
    for (const decoded of decodedParts) {
      if (isRecord(current)) {
        current = current[decoded];
        if (current === undefined) {
          return null;
        }
      } else {
        return null;
      }
    }
  }

  return current;
};

const toFileSystemItem = (name: string, value: JsonValue): FileSystemItem => {
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
