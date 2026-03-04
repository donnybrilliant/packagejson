import { readFile, writeFile } from "node:fs/promises";
import { cache } from "@/cache";
import { CACHE_TTLS, env } from "@/env";
import { fetchFolderStructure, getRepositories } from "@/services/github";
import { getErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";

/**
 * Type representing the file structure data structure
 * Maps repository names to their folder structures
 */
type FilesData = Record<string, Record<string, unknown>>;

const CACHE_KEY = "files";

/**
 * Reads file structure data from local data.json file
 * @returns Promise that resolves to files data or null if file doesn't exist or can't be parsed
 */
const getLocalData = async (): Promise<FilesData | null> => {
  try {
    const rawData = await readFile(env.DATA_JSON_PATH, "utf-8");
    const data = JSON.parse(rawData) as FilesData;
    log("info", "Loaded files data from data.json");
    return data;
  } catch (error) {
    log("debug", "Could not load local data.json", {
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Saves file structure data to local data.json file
 * Only saves if SAVE_FILE is enabled in environment
 * @param data - Files data to save
 */
const saveToDataJson = async (data: FilesData): Promise<void> => {
  if (!env.SAVE_FILE) return;
  try {
    await writeFile(env.DATA_JSON_PATH, JSON.stringify(data, null, 2));
    log("info", "Saved files data to data.json");
  } catch (error) {
    log("error", "Error saving to data.json", {
      error: getErrorMessage(error),
    });
  }
};

/**
 * Fetches file structure data from all repositories
 * Uses caching, local data.json, or fetches from GitHub API
 * @returns Promise that resolves to files data structure
 */
export const fetchFilesData = async (): Promise<FilesData> => {
  // Check cache first
  const cached = await cache.get<FilesData>(CACHE_KEY);
  if (cached) {
    return cached;
  }

  // Check local data.json if enabled (v1: fail if missing instead of falling back)
  if (env.USE_LOCAL_DATA) {
    const localData = await getLocalData();
    if (localData) {
      await cache.set(CACHE_KEY, localData, CACHE_TTLS.extended);
      return localData;
    }
    throw new Error(
      `USE_LOCAL_DATA is true but local data file not found at ${env.DATA_JSON_PATH}`,
    );
  }

  // Fetch from GitHub
  let data: FilesData = {};
  if (Bun.env.NODE_ENV === "test") {
    // Return stub data in test mode
    data = {
      "test-repo": {
        "package.json": '{"name": "test"}',
        src: {
          "index.ts": "export default {};",
        },
      },
    };
  } else {
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
  }

  // Save to data.json if enabled
  if (!env.USE_LOCAL_DATA && env.SAVE_FILE) {
    await saveToDataJson(data);
  }

  // Cache the result
  await cache.set(CACHE_KEY, data, CACHE_TTLS.extended);

  return data;
};

/**
 * Refreshes file structure data by clearing cache and fetching fresh data
 * @returns Promise that resolves when refresh is complete
 */
export const refreshFilesData = async (): Promise<void> => {
  log("info", "Refreshing files data cache");
  await cache.del(CACHE_KEY);
  await fetchFilesData();
};

/**
 * Navigates through file structure data using path segments
 * @param data - Files data structure
 * @param pathSegments - Array of path segments to navigate (URL-decoded)
 * @returns The value at the path, or null if path doesn't exist
 */
export const getFileAtPath = (data: FilesData, pathSegments: string[]): unknown => {
  if (pathSegments.length === 0) {
    return data;
  }

  let current: unknown = data;
  for (const segment of pathSegments) {
    const decoded = decodeURIComponent(segment);
    if (typeof current === "object" && current !== null && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[decoded];
      if (current === undefined) {
        return null;
      }
    } else {
      return null;
    }
  }

  return current;
};
