import { getVercelSites } from "../services/vercel.js";

function vercelRoutes(app) {
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
