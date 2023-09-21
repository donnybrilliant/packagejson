import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

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
    throw error;
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
          structure[item.name] = await fetchFileContent(repoName, item.path);
        }
      }
      return structure;
    }
  } catch (error) {
    logger.error(`Error in fetchFolderStructure: ${error.message}`);
    throw error;
  }
}

export async function fetchFileContent(repoName, filePath) {
  try {
    const data = await fetchGitHubAPI(
      `/repos/${ENV.USERNAME}/${repoName}/contents/${filePath}`
    );
    if (data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch (error) {
    logger.error(`Error in fetchFileContent: ${error.message}`);
    throw error;
  }
}
