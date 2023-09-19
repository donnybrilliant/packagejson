import express from "express";
import { ENV } from "./config.js";
import { getRepositories, getPackageDetails } from "./api.js";

const app = express();

app.get("/", (req, res) => {
  res.send("package.json");
});

app.get("/repos", async (req, res) => {
  try {
    const repos = await getRepositories();
    res.json(repos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/package.json", async (req, res) => {
  try {
    const repos = await getRepositories();
    const aggregatedData = {
      dependencies: {},
      devDependencies: {},
    };

    for (const repo of repos) {
      const packageDetails = await getPackageDetails(repo.name);
      if (packageDetails) {
        aggregatedData.dependencies = {
          ...aggregatedData.dependencies,
          ...packageDetails.dependencies,
        };
        aggregatedData.devDependencies = {
          ...aggregatedData.devDependencies,
          ...packageDetails.devDependencies,
        };
      }
    }

    res.json(aggregatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(ENV.PORT, () => {
  console.log(`Server is running on http://localhost:${ENV.PORT}`);
});
