import { getRenderSites } from "../services/render.js";

/**
 * Defines a GET route at "/render" on the provided express application.
 * The route handler will attempt to retrieve render site data from an external resource.
 * In case of an error during the data retrieval it will pass the error to the next middleware
 * in line in the Express.js request-response cycle.
 *
 * @param {object} app - The express application object
 *
 * @openapi
 * /render:
 *   get:
 *     description: Retrieve render site data from an external resource.
 *     responses:
 *       200:
 *         description: Successful retrieval of render site data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Render site data.
 *       500:
 *         description: Internal Server Error or error in data retrieval.
 *
 */
function renderRoutes(app) {
  app.get("/render", async (req, res, next) => {
    try {
      // Fetches render sites data
      const data = await getRenderSites();
      // Sends the fetched data as JSON
      return res.json(data);
    } catch (error) {
      // Passes the error to the next middleware
      next(error);
    }
  });
}

export default renderRoutes;
