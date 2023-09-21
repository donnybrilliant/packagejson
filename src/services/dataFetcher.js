import { getRepositories, getPackageDetails } from "./github.js";
import { packageJsonCache } from "../utils/cache.js";
import semver from "semver";

export async function fetchAggregatedData(versionType = "max") {
  try {
    const cachedData = packageJsonCache.get(`packageData-${versionType}`);
    if (cachedData) {
      return cachedData;
    }

    const repos = await getRepositories("all");

    const aggregatedData = {
      dependencies: {},
      devDependencies: {},
    };

    const tempData = {
      dependencies: {},
      devDependencies: {},
    };

    for (const repo of repos) {
      const packageDetails = await getPackageDetails(repo.name);
      if (packageDetails) {
        aggregateVersion(
          aggregatedData.dependencies,
          packageDetails.dependencies,
          versionType,
          "dependencies",
          tempData
        );
        aggregateVersion(
          aggregatedData.devDependencies,
          packageDetails.devDependencies,
          versionType,
          "devDependencies",
          tempData
        );
      }
    }

    packageJsonCache.set(`packageData-${versionType}`, aggregatedData);
    return aggregatedData;
  } catch (error) {
    logger.error(`Error in fetchAggregatedData ${error.message}`);
    throw error;
  }
}

function aggregateVersion(
  aggregated,
  current,
  versionType = "max",
  depType,
  tempData
) {
  for (const [name, version] of Object.entries(current || {})) {
    const cleanedCurrentVersion = semver.coerce(version);

    if (!tempData[depType][name]) {
      tempData[depType][name] = {
        min: cleanedCurrentVersion.version,
        max: cleanedCurrentVersion.version,
      };
    } else {
      const cleanedMinVersion = semver.coerce(tempData[depType][name].min);
      const cleanedMaxVersion = semver.coerce(tempData[depType][name].max);

      if (semver.lt(cleanedCurrentVersion, cleanedMinVersion)) {
        tempData[depType][name].min = cleanedCurrentVersion.version;
      }

      if (semver.gt(cleanedCurrentVersion, cleanedMaxVersion)) {
        tempData[depType][name].max = cleanedCurrentVersion.version;
      }
    }
  }

  for (const [name, versionData] of Object.entries(tempData[depType])) {
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
}
