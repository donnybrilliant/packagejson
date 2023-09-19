import express from "express";
import { ENV } from "./config.js";
import { getRepositories } from "./api.js";
import { getCachedData, isCacheValid, invalidateCache } from "./cache.js";
import { fetchAggregatedData } from "./dataFetcher.js";

const app = express();

app.get("/", (req, res) => {
  res.send(`<a href="/package.json">package.json</a><br>
  <a href="/repos">repos</a>`);
});

app.get("/repos", async (req, res) => {
  try {
    const repos = await getRepositories();
    const repoLinks = repos
      .map((repo) => `<a href="${repo.html_url}">${repo.name}</a>`)
      .join("<br>");
    res.send(repoLinks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/test", async (req, res) => {
  try {
    const repos = await getRepositories();
    res.json(repos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
