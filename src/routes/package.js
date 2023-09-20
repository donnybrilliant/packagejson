import { packageJsonCache } from "../utils/cache.js";
import { fetchAggregatedData } from "../services/dataFetcher.js";

function packageRoutes(app) {
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
}

export default packageRoutes;
