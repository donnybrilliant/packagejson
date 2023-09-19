import express from "express";
import { ENV } from "./config.js";
import { getRepositories, fetchFolderStructure } from "./api.js";
import {
  setCachedData,
  getCachedData,
  isCacheValid,
  invalidateCache,
} from "./cache.js";
import { fetchAggregatedData } from "./dataFetcher.js";

const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;

const app = express();

app.get("/", (req, res) => {
  res.send(`<a href="/package.json">package.json</a><br>
  <a href="/repos">repos</a>`);
});

/* app.get("/test", async (req, res) => {
  try {
    const repos = await getRepositories("all");
    res.json(repos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}); */

app.get("/repos", async (req, res) => {
  try {
    const repos = await getRepositories("all");
    const repoLinks = repos
      .map((repo) => `<a href="${repo.html_url}">${repo.name}</a>`)
      .join("<br>");
    res.send(repoLinks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/package.json", async (req, res) => {
  try {
    if (isCacheValid("package_json_cache", ONE_WEEK_IN_MS)) {
      return res.json(getCachedData("package_json_cache"));
    }

    const data = await fetchAggregatedData();
    setCachedData("package_json_cache", data);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/package.json/refresh", async (req, res) => {
  try {
    invalidateCache();
    const data = await fetchAggregatedData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/files", async (req, res) => {
  try {
    if (isCacheValid("files_cache", ONE_MONTH_IN_MS)) {
      return res.json(getCachedData("files_cache"));
    }

    const repos = await getRepositories();
    const result = {};
    for (const repo of repos) {
      result[repo.name] = await fetchFolderStructure(repo.name);
    }

    setCachedData("files_cache", result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/files/refresh", async (req, res) => {
  try {
    invalidateCache("files");
    res.send("Cache for /files invalidated");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(ENV.PORT, () => {
  console.log(`Server is running on http://localhost:${ENV.PORT}`);
});
