import { cache } from "@/cache";
import { CACHE_TTLS, env } from "@/env";
import { coerce, compare } from "@/semver";
import { getPackageDetails, getRepositories } from "@/services/github";
import { getErrorMessage } from "@/utils/errors";
import { GitHubRateLimitError } from "@/utils/github";
import { log } from "@/utils/logger";

/**
 * Version aggregation type
 */
type VersionType = "min" | "max" | "minmax";

/**
 * Temporary version data structure for tracking min/max versions
 */
type TempVersionData = {
  min: string;
  max: string;
};

/**
 * Sorts object keys alphabetically
 * @param obj - Object to sort
 * @returns New object with sorted keys
 */
const sortObjectKeys = <T extends Record<string, string>>(obj: T): Record<string, string> => {
  return Object.keys(obj)
    .sort()
    .reduce(
      (sorted, key) => {
        sorted[key] = obj[key];
        return sorted;
      },
      {} as Record<string, string>,
    );
};

/**
 * Aggregates version data by tracking min/max versions across repositories
 * @param current - Current dependency versions from a repository
 * @param depType - Dependency type ("dependencies" or "devDependencies")
 * @param tempData - Temporary data structure to accumulate min/max values
 */
const aggregateVersion = (
  current: Record<string, string> | undefined,
  depType: "dependencies" | "devDependencies",
  tempData: {
    dependencies: Record<string, TempVersionData>;
    devDependencies: Record<string, TempVersionData>;
  },
): void => {
  if (!current) return;

  for (const [name, version] of Object.entries(current)) {
    const cleanedCurrent = coerce(version);
    if (!cleanedCurrent) continue;

    if (!tempData[depType][name]) {
      tempData[depType][name] = {
        min: cleanedCurrent,
        max: cleanedCurrent,
      };
    } else {
      const cleanedMin = coerce(tempData[depType][name].min);
      const cleanedMax = coerce(tempData[depType][name].max);

      if (cleanedMin && compare(cleanedCurrent, cleanedMin) < 0) {
        tempData[depType][name].min = cleanedCurrent;
      }

      if (cleanedMax && compare(cleanedCurrent, cleanedMax) > 0) {
        tempData[depType][name].max = cleanedCurrent;
      }
    }
  }
};

/**
 * Builds final aggregated data from temporary version data
 * @param aggregated - Output object to populate
 * @param tempData - Temporary data with min/max versions
 * @param versionType - How to aggregate: "min", "max", or "minmax"
 */
const buildAggregated = (
  aggregated: Record<string, string>,
  tempData: Record<string, TempVersionData>,
  versionType: VersionType,
): void => {
  for (const [name, versionData] of Object.entries(tempData)) {
    if (versionType === "min") {
      aggregated[name] = versionData.min;
    } else if (versionType === "max") {
      aggregated[name] = versionData.max;
    } else if (versionType === "minmax") {
      aggregated[name] =
        versionData.min === versionData.max
          ? versionData.min
          : `${versionData.min} - ${versionData.max}`;
    }
  }
};

/**
 * Fetches and aggregates package.json dependencies from all repositories
 * Supports min, max, and minmax version aggregation strategies
 * Results are cached for 1 week
 * @param versionType - Aggregation strategy: "min", "max", or "minmax" (default: "max")
 * @returns Promise that resolves to aggregated dependencies or null on error
 */
export const fetchAggregatedData = async (
  versionType: VersionType = "max",
): Promise<{
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} | null> => {
  // Check cache first
  const cacheKey = `packageData-${versionType}`;
  const cached = await cache.get<{
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  }>(cacheKey);

  if (cached) {
    log("debug", "Returning cached aggregated package data", { versionType });
    return cached;
  }

  log("info", "Fetching aggregated package data", { versionType });

  // Avoid network in tests
  if (env.NODE_ENV === "test") {
    return {
      dependencies: { test: "1.0.0" },
      devDependencies: { "@types/test": "1.0.0" },
    };
  }

  try {
    const repos = await getRepositories(env.REPOS_ALLOW_PRIVATE ? "all" : "public");
    if (!repos || repos.length === 0) {
      return { dependencies: {}, devDependencies: {} };
    }

    const aggregatedData = {
      dependencies: {} as Record<string, string>,
      devDependencies: {} as Record<string, string>,
    };

    const tempData = {
      dependencies: {} as Record<string, TempVersionData>,
      devDependencies: {} as Record<string, TempVersionData>,
    };

    for (const repo of repos) {
      const owner = repo.owner?.login ?? repo.full_name?.split("/")[0] ?? env.USERNAME ?? "";
      if (!owner) continue;

      const packageDetails = await getPackageDetails(repo.name, owner);
      if (packageDetails) {
        aggregateVersion(packageDetails.dependencies, "dependencies", tempData);
        aggregateVersion(packageDetails.devDependencies, "devDependencies", tempData);
      }
    }

    // Build aggregated data from tempData
    buildAggregated(aggregatedData.dependencies, tempData.dependencies, versionType);
    buildAggregated(aggregatedData.devDependencies, tempData.devDependencies, versionType);

    // Sort dependencies and devDependencies alphabetically
    aggregatedData.dependencies = sortObjectKeys(aggregatedData.dependencies);
    aggregatedData.devDependencies = sortObjectKeys(aggregatedData.devDependencies);

    // Cache for 1 week
    await cache.set(cacheKey, aggregatedData, CACHE_TTLS.extended);
    log("info", "Cached aggregated package data", {
      versionType,
      dependenciesCount: Object.keys(aggregatedData.dependencies).length,
      devDependenciesCount: Object.keys(aggregatedData.devDependencies).length,
    });

    return aggregatedData;
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      throw error;
    }
    log("error", "Error in fetchAggregatedData", {
      versionType,
      error: getErrorMessage(error),
    });
    return null;
  }
};
