import fetch from "node-fetch";
import { ENV } from "./config.js";

export async function fetchGitHubAPI(endpoint) {
  const response = await fetch(`${ENV.GITHUB_API_URL}${endpoint}`, {
    headers: {
      Authorization: `token ${ENV.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  return response.json();
}

export async function getRepositories(type = "public") {
  return fetchGitHubAPI(`/user/repos?type=${type}&per_page=100`);
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
    console.error(error);
    return null;
  }
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
    console.error(error);
    return null;
  }
}
