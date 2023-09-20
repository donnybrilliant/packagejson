import { packageJsonCache } from "../utils/cache.js";
import { fetchAggregatedData } from "../services/dataFetcher.js";

function packageRoutes(app) {
  app.get("/package.json", async (req, res) => {
    try {
      const versionType = req.query.version || "max";

      const cachedData = packageJsonCache.get(`packageData-${versionType}`);
      if (cachedData) {
        return res.json(cachedData);
      }

      const data = await fetchAggregatedData(versionType);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/package.json/refresh", async (req, res) => {
    try {
      const versionType = req.query.version || "max";

      const data = await fetchAggregatedData(versionType);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

export default packageRoutes;
