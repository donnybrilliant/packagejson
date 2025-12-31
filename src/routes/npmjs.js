import { getNpmPackageInfo, getNpmPackageLatest } from "../services/npmjs.js";

/**
 * Function to define routes for fetching npmjs package data.
 * @param {object} app - The Express application instance.
 *
 * @openapi
 * /npmjs/{packageName}:
 *   get:
 *     description: Fetches npmjs package information for a given package name.
 *     parameters:
 *       - in: path
 *         name: packageName
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the npm package
 *       - in: query
 *         name: latest
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, returns only latest version information (faster)
 *     responses:
 *       200:
 *         description: Successful retrieval of npmjs package data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: npmjs package information.
 *       404:
 *         description: Package not found on npmjs.
 *       500:
 *         description: Internal Server Error.
 */
function npmjsRoutes(app) {
  app.get("/npmjs/:packageName", async (req, res, next) => {
    try {
      const { packageName } = req.params;
      const { latest } = req.query;

      if (!packageName) {
        return res.status(400).json({
          error: "Package name is required",
          message: "Please provide a package name in the URL path",
        });
      }

      // If latest=true, use the faster endpoint that only returns latest version
      const packageInfo =
        latest === "true"
          ? await getNpmPackageLatest(packageName)
          : await getNpmPackageInfo(packageName);

      if (!packageInfo) {
        return res.status(404).json({
          error: "Package not found",
          message: `Package "${packageName}" not found on npmjs`,
        });
      }

      return res.json({ data: packageInfo });
    } catch (error) {
      next(error);
    }
  });
}

export default npmjsRoutes;
