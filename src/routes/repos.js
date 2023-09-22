import handleResponseType from "../middleware/handleResponseType.js";
import { getRepositories } from "../services/github.js";

/**
 * The reposRoutes function sets up several routes in an Express.js application.
 *
 * @param {Object} app - An instance of the Express.js application.
 * @returns {void}
 */
function reposRoutes(app) {
  /**
   * A helper function to fetch repositories of a certain type and format the response.
   * @async
   * @param {string} repoType - The type of repositories to fetch.
   * @param {Object} req - The Express request object.
   * @param {Object} res - The Express response object.
   * @param {Function} next - The next function.
   * @returns {Object | void} The express response, or void if next() is called with an error.
   */
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

  // The handleResponseType middleware
  app.use("/repos", handleResponseType);

  /**
   * @openapi
   * /repos:
   *   get:
   *     description: Fetch and display Public repositories
   *     responses:
   *       200:
   *         description: A list of public repositories.
   */
  app.get("/repos", (req, res, next) => {
    fetchAndFormatRepos("public", req, res, next);
  });

  /**
   * @openapi
   * /repos/all:
   *   get:
   *     description: Fetch and display All repositories
   *     responses:
   *       200:
   *         description: A list of all repositories.
   */
  app.get("/repos/all", (req, res, next) => {
    fetchAndFormatRepos("all", req, res, next);
  });
}

export default reposRoutes;
