import { getNetlifySites } from "../services/netlify.js";
import { createDeploymentPlatformRoute } from "../utils/deploymentPlatform.js";

/**
 * Function to define routes for fetching Netlify site data.
 * @param {object} app - The Express application instance.
 *
 * @openapi
 * /netlify:
 *   get:
 *     description: Fetches Netlify site data.
 *     responses:
 *       200:
 *         description: Successful retrieval of Netlify site data.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *               description: List of Netlify sites.
 *       500:
 *         description: Internal Server Error.
 */
function netlifyRoutes(app) {
  app.get("/netlify", createDeploymentPlatformRoute(getNetlifySites));
}

export default netlifyRoutes;
