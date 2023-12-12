import fetch from "node-fetch";
import { ENV, ONLY_SAVE_LINKS } from "../../config/index.js";
import { isImage, isVideo, isOtherBinary } from "../utils/extensions.js";
import { logger } from "../middleware/logger.js";
import { packageJsonCache } from "../utils/cache.js";
import semver from "semver";

/**
 * Fetches data from the GitHub API.
 * @async
 * @param {string} endpoint - The API endpoint to call.
 * @returns {Promise<Object>} The data returned from the API.
 */
export async function fetchGitHubAPI(endpoint) {
  try {
    const response = await fetch(`${ENV.GITHUB_API_URL}${endpoint}`, {
      headers: {
        Authorization: `token ${ENV.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    logger.info(
      `API call to ${ENV.GITHUB_API_URL}${endpoint} with status ${response.status} ${response.statusText}`
    );
    return response.json();
  } catch (error) {
    logger.error(`Error in fetchGitHubAPI: ${error.message}`);
  }
}

/**
 * Retrieves the repositories of the user.
 * @async
 * @param {string} [type="public"] - Type of repositories to retrieve.
 * @returns {Promise<Array<Object>>} An array of repositories.
 */
export async function getRepositories(type = "public") {
  return fetchGitHubAPI(`/user/repos?type=${type}&per_page=100`);
}

/**
 * Retrieves the package details for a given repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @returns {Promise<Object|null>} An object containing the dependencies and devDependencies, or null if not found.
 */
export async function getPackageDetails(repoName) {
  const packageJsonContent = await fetchFileContent(repoName, "package.json");
  if (packageJsonContent) {
    const packageJson = JSON.parse(packageJsonContent);
    return {
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
    };
  }
  return null;
}

/**
 * Fetches the folder structure for a given repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [path=""] - The path inside the repository.
 * @returns {Promise<Object|null>} An object representing the folder structure.
 */
export async function fetchFolderStructure(repoName, path = "") {
  try {
    const data = await fetchGitHubAPI(
      `/repos/${ENV.USERNAME}/${repoName}/contents/${path}`
    );
    if (Array.isArray(data)) {
      const structure = {};
      for (const item of data) {
        if (item.type === "dir") {
          structure[item.name] = await fetchFolderStructure(
            repoName,
            item.path
          );
        } else if (item.type === "file") {
          structure[item.name] = await fetchFileContent(
            repoName,
            item.path,
            ONLY_SAVE_LINKS
          );
        }
      }
      return structure;
    }
  } catch (error) {
    logger.error(`Error in fetchFolderStructure: ${error.message}`);
  }
}

/**
 * Fetches the content of a file in a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} filePath - Path to the file inside the repository.
 * @param {boolean} [alwaysProvideLink=false] - Whether to always return a link regardless of the file type.
 * @returns {Promise<string|null>} The content of the file or a link to it, or null if not found.
 */
export async function fetchFileContent(
  repoName,
  filePath,
  alwaysProvideLink = false
) {
  try {
    const data = await fetchGitHubAPI(
      `/repos/${ENV.USERNAME}/${repoName}/contents/${filePath}`
    );

    if (
      alwaysProvideLink ||
      (data && (isImage(data) || isVideo(data) || isOtherBinary(data)))
    ) {
      return `https://github.com/${ENV.USERNAME}/${repoName}/blob/main/${filePath}`;
    }

    if (data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchFileContent: ${error.message}`);
  }
}

/**
 * Fetches aggregated dependency data from all repositories of the user.
 * @async
 * @param {string} [versionType="max"] - The type of version to fetch (min, max, or minmax).
 * @returns {Promise<Object|null>} An object containing aggregated dependency data.
 */
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

    // Sort dependencies and devDependencies alphabetically
    aggregatedData.dependencies = sortObjectKeys(aggregatedData.dependencies);
    aggregatedData.devDependencies = sortObjectKeys(
      aggregatedData.devDependencies
    );

    packageJsonCache.set(`packageData-${versionType}`, aggregatedData);
    return aggregatedData;
  } catch (error) {
    logger.error(`Error in fetchAggregatedData ${error.message}`);
  }
}

/**
 * Aggregates dependency versions.
 * @param {Object} aggregated - The aggregated dependency data.
 * @param {Object} current - The current repository's dependency data.
 * @param {string} [versionType="max"] - The type of version to fetch (min, max, or minmax).
 * @param {string} depType - Type of dependencies (dependencies or devDependencies).
 * @param {Object} tempData - Temporary data for aggregating versions.
 */
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

/**
 * Sorts an object's keys alphabetically and returns a new object.
 * @param {Object} obj - The object to sort.
 * @returns {Object} A new object with sorted keys.
 */
function sortObjectKeys(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((sortedObj, key) => {
      sortedObj[key] = obj[key];
      return sortedObj;
    }, {});
}
