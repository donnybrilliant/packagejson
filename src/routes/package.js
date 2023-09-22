import { packageJsonCache } from "../utils/cache.js";
import { fetchAggregatedData } from "../services/github.js";
import { logger } from "../middleware/logger.js";

function packageRoutes(app) {
  app.get("/package.json", async (req, res, next) => {
    try {
      const versionType = req.query.version || "max";

      const cachedData = packageJsonCache.get(`packageData-${versionType}`);
      if (cachedData) {
        return res.json(cachedData);
      }

      const data = await fetchAggregatedData(versionType);
      return res.json(data);
    } catch (error) {
      next(error);
    }
  });

  app.get("/package.json/refresh", async (req, res, next) => {
    try {
      const versionType = req.query.version || "max";
      logger.info("refreshing data...");
      const data = await fetchAggregatedData(versionType);
      return res.redirect("/package.json");
    } catch (error) {
      next(error);
    }
  });
}

export default packageRoutes;
