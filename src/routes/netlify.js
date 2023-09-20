import { getNetlifySites } from "../services/netlify.js";

function netlifyRoutes(app) {
  app.get("/netlify", async (req, res, next) => {
    try {
      const data = await getNetlifySites();
      res.json(data);
    } catch (error) {
      next(error);
    }
  });
}

export default netlifyRoutes;
