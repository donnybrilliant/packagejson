import express from "express";
import fs from "fs";
import path from "path";
import morgan from "morgan";
import { fileURLToPath } from "url";
import { ENV } from "./config.js";
import { getRepositories, fetchFolderStructure } from "./api.js";
import { packageJsonCache, filesCache } from "./cache.js";
import { fetchAggregatedData } from "./dataFetcher.js";

const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a write stream (in append mode)
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, "access.log"),
  { flags: "a" }
);

// Setup the morgan middleware to use the write stream
app.use(morgan("combined", { stream: accessLogStream }));

// ... (the rest of your code)

app.get("/", (req, res) => {
  res.send(`
    <a href="/package.json">package.json</a><br>
    <a href="/repos">repos</a>
  `);
});

app.get("/repos", async (req, res) => {
  try {
    const type = req.query.type || "public";
    const repos = await getRepositories(type);
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
    const cachedData = packageJsonCache.get("packageData");
    if (cachedData) {
      return res.json(cachedData);
    }

    const data = await fetchAggregatedData();
    packageJsonCache.set("packageData", data);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/package.json/refresh", async (req, res) => {
  try {
    const data = await fetchAggregatedData();
    packageJsonCache.set("packageData", data);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/files", async (req, res) => {
  try {
    const cachedData = filesCache.get("files");
    if (cachedData) {
      return res.json(cachedData);
    }

    const repos = await getRepositories();
    const result = {};
    for (const repo of repos) {
      result[repo.name] = await fetchFolderStructure(repo.name);
    }
    filesCache.set("files", result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/files/refresh", async (req, res) => {
  try {
    const repos = await getRepositories();
    const result = {};
    for (const repo of repos) {
      result[repo.name] = await fetchFolderStructure(repo.name);
    }
    filesCache.set("files", result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(ENV.PORT, () => {
  console.log(`Server is running on http://localhost:${ENV.PORT}`);
});
