import { getRenderSites } from "../services/render.js";

function renderRoutes(app) {
  app.get("/render", async (req, res, next) => {
    try {
      const data = await getRenderSites();
      return res.json(data);
    } catch (error) {
      next(error);
    }
  });
}

export default renderRoutes;
