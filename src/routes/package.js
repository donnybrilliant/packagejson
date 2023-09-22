import { packageJsonCache } from "../utils/cache.js";
import { fetchAggregatedData } from "../services/github.js";
import { logger } from "../middleware/logger.js";

/**
 * Sets up GET routes related to the package.json data.
 *
 * @param {object} app - Express application.
 *
 * @name packageRoutes
 * @function
 * @module packageRoutes
 *
 * The handler for the GET request to "/package.json".
 *
 * @name get/package.json
 * @function
 * @inner
 * @param {string} path - Express path
 * @param {callback} middleware - Express middleware
 *
 * @example
 *
 *  // GET /package.json?version=max
 *  // Expected: JSON output from the package.json aggregated data.
 *
 * The handler for the GET request to "/package.json/refresh".
 *
 * @name get/package.json/refresh
 * @function
 * @inner
 * @param {string} path - Express path
 * @param {callback} middleware - Express middleware
 *
 * @example
 *
 *  // GET /package.json/refresh?version=max
 *  // Expected: Refreshes the package.json aggregated data and redirects to /package.json.
 */

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
