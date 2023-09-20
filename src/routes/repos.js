import { getRepositories } from "../services/api.js";

function reposRoutes(app) {
  app.get("/repos", async (req, res, next) => {
    try {
      const type = req.query.type || "public";
      const repos = await getRepositories(type);
      const repoLinks = repos
        .map((repo) => `<a href="${repo.html_url}">${repo.name}</a>`)
        .join("<br>");
      res.send(repoLinks);
    } catch (error) {
      next(error);
    }
  });
}

export default reposRoutes;
