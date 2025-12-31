import { getVercelSites } from "../services/vercel.js";
import { createDeploymentPlatformRoute } from "../utils/deploymentPlatform.js";

/**
 * Sets up the routes for the Vercel service.
 * @param {Object} app - The express application.
 *
 * @openapi
 * /vercel:
 *   get:
 *     description: Retrieve Vercel sites data.
 *     responses:
 *       200:
 *         description: Successful retrieval of Vercel sites data.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *               description: Array of Vercel site data.
 *       500:
 *         description: Internal Server Error or error in data retrieval.
 */
function vercelRoutes(app) {
  app.get("/vercel", createDeploymentPlatformRoute(getVercelSites));
}

export default vercelRoutes;
