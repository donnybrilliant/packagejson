import fetch from "node-fetch";
import { ENV, ONLY_SAVE_LINKS } from "../../config/index.js";
import { isImage, isVideo, isOtherBinary } from "../utils/extensions.js";
import { logger } from "../middleware/logger.js";
import { packageJsonCache } from "../utils/cache.js";
import semver from "semver";

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

export async function getRepositories(type = "public") {
  return fetchGitHubAPI(`/user/repos?type=${type}&per_page=100`);
}

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
