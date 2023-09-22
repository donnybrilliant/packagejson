import { getNetlifySites } from "../services/netlify.js";

/**
 * Function to define routes for fetching Netlify site data.
 * @param {object} app - The Express application instance.
 */
function netlifyRoutes(app) {
  /**
   * Route handler for GET /netlify.
   * Fetches Netlify site data and sends it as a JSON response.
   * If an error occurs, it is passed to the next middleware.
   */
  app.get("/netlify", async (req, res, next) => {
    try {
      const data = await getNetlifySites();
      return res.json(data);
    } catch (error) {
      next(error);
    }
  });
}

export default netlifyRoutes;
