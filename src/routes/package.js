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
  /**
   * @openapi
   * /package.json:
   *   get:
   *     description: Retrieves the aggregated package.json data.
   *     parameters:
   *       - in: query
   *         name: version
   *         schema:
   *           type: string
   *           enum: [min, max]
   *           default: max
   *         description: The type of version (min or max) for aggregated data. Defaults to 'max'.
   *     responses:
   *       200:
   *         description: Successful retrieval of package.json data.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Aggregated package.json data.
   *       500:
   *         description: Internal Server Error.
   *
   * /package.json/refresh:
   *   get:
   *     description: Refreshes the aggregated package.json data and redirects to /package.json.
   *     parameters:
   *       - in: query
   *         name: version
   *         schema:
   *           type: string
   *           enum: [min, max]
   *           default: max
   *         description: The type of version (min or max) for aggregated data. Defaults to 'max'.
   *     responses:
   *       302:
   *         description: Successfully refreshed data and redirected to /package.json.
   *       500:
   *         description: Internal Server Error.
   *
   */
  /**
   * Validates version type parameter
   * @param {string} version - Version type from query
   * @returns {string} Validated version type (defaults to "max")
   */
  function validateVersionType(version) {
    const validTypes = ["min", "max", "minmax"];
    return validTypes.includes(version) ? version : "max";
  }

  app.get("/package.json", async (req, res, next) => {
    try {
      const versionType = validateVersionType(req.query.version);

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
      const versionType = validateVersionType(req.query.version);
      logger.info(`Refreshing package data for version type: ${versionType}`);
      await fetchAggregatedData(versionType);
      return res.redirect(`/package.json?version=${versionType}`);
    } catch (error) {
      next(error);
    }
  });
}

export default packageRoutes;
