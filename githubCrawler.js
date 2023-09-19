import fetch from "node-fetch";
import express from "express";
import { config } from "dotenv";

config();

const GITHUB_API_URL = process.env.GITHUB_API_URL;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const USERNAME = process.env.USERNAME;

async function fetchGitHubAPI(endpoint) {
  const response = await fetch(`${GITHUB_API_URL}${endpoint}`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  return response.json();
}

async function getRepositories() {
  return fetchGitHubAPI(`/users/${USERNAME}/repos`);
}

async function fetchFileContent(repoName, filePath) {
  try {
    const data = await fetchGitHubAPI(
      `/repos/${USERNAME}/${repoName}/contents/${filePath}`
    );
    if (data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
  } catch {
    // Handle errors (e.g., file not found)
  }
  return null;
}

function identifyBuildTool(packageJson) {
  if (packageJson.dependencies && packageJson.dependencies["react-scripts"]) {
    return "create-react-app";
  }
  if (packageJson.dependencies && packageJson.dependencies.vite) {
    return "vite";
  }
  if (packageJson.devDependencies && packageJson.devDependencies.webpack) {
    return "webpack";
  }
  return "unknown";
}

async function getPackageDetails(repoName) {
  const packageJsonContent = await fetchFileContent(repoName, "package.json");
  if (packageJsonContent) {
    const packageJson = JSON.parse(packageJsonContent);
    return {
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
      buildTool: identifyBuildTool(packageJson),
    };
  }
  return null;
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/getPackageDetails", async (req, res) => {
  try {
    const repos = await getRepositories();
    const aggregatedData = [];

    for (const repo of repos) {
      const packageDetails = await getPackageDetails(repo.name);
      if (packageDetails) {
        aggregatedData.push({
          repo: repo.name,
          ...packageDetails,
        });
      }
    }

    res.json(aggregatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
