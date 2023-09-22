import handleResponseType from "../middleware/handleResponseType.js";
import { getRepositories } from "../services/github.js";

function reposRoutes(app) {
  const fetchAndFormatRepos = async (repoType, req, res, next) => {
    try {
      const repos = await getRepositories(repoType);
      const repoList = repos.map((repo) => {
        const object = {
          name: repo.name,
          description: repo.description,
          html_url: repo.html_url,
          homepage: repo.homepage,
          language: repo.language,
          deployments: repo.deployments_url,
        };

        if (repo.has_pages) {
          object.pages = `https://${repo.owner.login}.github.io/${repo.name}`;
        } else {
          object.pages = null;
        }

        return object;
      });

      if (req.isHtmlRequest) {
        const listItems = repoList
          .map((repo) => {
            return `<li><a href="${repo.html_url}">${repo.name}</a></li>`;
          })
          .join("\n");

        return res.send(
          `<ul style="list-style: none; margin: 0; padding: 0;">${listItems}</ul>`
        );
      } else if (req.isJsonRequest) {
        return res.json(repoList);
      }
    } catch (error) {
      next(error);
    }
  };

  app.use("/repos", handleResponseType);

  app.get("/repos", (req, res, next) => {
    // Default type if you want a different type for this route
    fetchAndFormatRepos("public", req, res, next);
  });

  app.get("/repos/all", (req, res, next) => {
    fetchAndFormatRepos("all", req, res, next);
  });
}

export default reposRoutes;
