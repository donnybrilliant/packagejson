import { getVercelSites } from "../services/vercel.js";

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
  /**
   * Route serving Vercel sites data.
   * @name get/vercel
   * @function
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {function} next - Express next middleware function.
   */

  app.get("/vercel", async (req, res, next) => {
    try {
      const data = await getVercelSites();
      return res.json(data);
    } catch (error) {
      next(error);
    }
  });
}

export default vercelRoutes;
