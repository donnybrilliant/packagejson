import express from "express";
import { ENV } from "./config.js";
import { getRepositories, fetchFolderStructure } from "./api.js";
import { getCachedData, isCacheValid, invalidateCache } from "./cache.js";
import { fetchAggregatedData } from "./dataFetcher.js";

const app = express();

app.get("/files", async (req, res) => {
  try {
    const repos = await getRepositories();
    const result = {};
    for (const repo of repos) {
      result[repo.name] = await fetchFolderStructure(repo.name);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send(`<a href="/package.json">package.json</a><br>
  <a href="/repos">repos</a>`);
});

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

/* app.get("/test", async (req, res) => {
  try {
    const repos = await getRepositories("all");
    res.json(repos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}); */

app.get("/package.json", async (req, res) => {
  try {
    if (isCacheValid()) {
      return res.json(getCachedData());
    }

    const data = await fetchAggregatedData();
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

app.listen(ENV.PORT, () => {
  console.log(`Server is running on http://localhost:${ENV.PORT}`);
});
