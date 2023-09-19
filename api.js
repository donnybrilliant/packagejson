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

export async function getRepositories() {
  return fetchGitHubAPI(`/user/repos?type=all&per_page=100`);
}

export async function fetchFileContent(repoName, filePath) {
  try {
    const data = await fetchGitHubAPI(
      `/repos/${ENV.USERNAME}/${repoName}/contents/${filePath}`
    );
    if (data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
  } catch {
    // Handle errors (e.g., file not found)
  }
  return null;
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
