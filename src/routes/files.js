import { filesCache } from "../utils/cache.js";
import { getRepositories, fetchFolderStructure } from "../services/api.js";

function filesRoutes(app) {
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
}

export default filesRoutes;
