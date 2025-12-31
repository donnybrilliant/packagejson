/**
 * This module exports a function that sets up file-based routes in an HTTP server.
 * @module filesRoutes
 * @requires {@link ../utils/cache.js|cache}
 * @requires {@link ../services/github.js|github}
 * @requires {@link ../middleware/logger.js|logger}
 * @requires fs
 * @requires path
 * @requires url
 * @requires ../../config/index.js
 * @requires {@link ../middleware/handleResponseType.js|handleResponseType}
 */

import { filesCache } from "../utils/cache.js";
import { getRepositories, fetchFolderStructure } from "../services/github.js";
import { logger } from "../middleware/logger.js";
import fs from "fs";
import { USE_LOCAL_DATA, SAVE_FILE } from "../../config/index.js";
import path from "path";
import { fileURLToPath } from "url";
import handleResponseType from "../middleware/handleResponseType.js";

let areRoutesCreated = false;

/**
 * Fetches the local data.
 * @function getLocalData
 * @returns {object} The local data
 * @private
 */
function getLocalData() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rawData = fs.readFileSync(
    path.join(__dirname, "../../data.json"),
    "utf8"
  );
  return JSON.parse(rawData);
}

/**
 * Fetches the data from GitHub or local source.
 * @async
 * @function fetchData
 * @returns {object} The GitHub or local data
 * @throws Will throw an error if it fails to fetch the data
 * @private
 */
async function fetchData() {
  try {
    if (filesCache.get("files")) {
      logger.info("fetching data from cache");
      return filesCache.get("files");
    }
    let data = {};
    if (USE_LOCAL_DATA) {
      logger.info("fetching local data");
      data = getLocalData();
    } else {
      const repos = await getRepositories();
      for (const repo of repos) {
        // Use repo.owner.login to handle repos from organizations or other users
        const owner = repo.owner?.login || repo.full_name?.split('/')[0];
        const folderStructure = await fetchFolderStructure(repo.name, "", owner);
        if (folderStructure) {
          data[repo.name] = folderStructure;
        } else {
          logger.error(
            `fetchFolderStructure returned falsy value for repo: ${owner}/${repo.name}`
          );
        }
      }
    }

    // Save the data to data.json
    if (!USE_LOCAL_DATA && SAVE_FILE) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const filePath = path.join(__dirname, "../../data.json");
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      logger.info("Data saved to data.json");
    }

    filesCache.set("files", data);
    return data;
  } catch (error) {
    logger.error(`Error in fetchData: ${error.message}`);
  }
}

/**
 * The main entry point to set up file-based routes in the app.
 * @function
 * @param {object} app - The Express app
 */
function filesRoutes(app) {
  /**
   * Ensures the data is loaded before handing the request.
   * @function
   * @param {object} req - The request object
   * @param {object} res - The response object
   * @param {function} next - The next function for Express middleware
   * @private
   */
  async function ensureDataLoaded(req, res, next) {
    try {
      if (!filesCache.get("files")) {
        logger.info("Data not loaded, loading data...");
        await loadDataAndCreateRoutes();
        next();
      } else {
        next();
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Loads the data and creates routes.
   * @async
   * @function loadDataAndCreateRoutes
   * @throws Will throw an error if it fails to fetch the data
   * @private
   */
  async function loadDataAndCreateRoutes() {
    try {
      const data = await fetchData();
      if (!areRoutesCreated) {
        createRoutes("/files", data, app);
        areRoutesCreated = true;
      }
    } catch (error) {
      logger.error(`Error in loadDataAndCreateRoutes: ${error.message}`);
      throw error; // Re-throw so it can be caught by the calling middleware
    }
  }

  /**
   * Middleware applied to all routes under "/files". It ensures data is loaded
   * and determines the appropriate response type before executing the route handler
   */
  app.use("/files", ensureDataLoaded, handleResponseType);

  /**
   * Handles GET request on "/files" route.
   * Fetches data (either locally or from GitHub based on config)
   * and returns it as HTML links or JSON based on request headers.
   *
   * @name get/files
   * @path {GET} /files
   * @code {200} if the server successfully returns the data
   * @response {string|object} links|data - response can be either HTML links or JSON data
   * @error {Error} 500 - 'Internal Server Error' if there is an issue fetching the data
   */

  /**
   * Middleware applied to all routes under "/files". It ensures data is loaded
   * and determines the appropriate response type before executing the route handler
   * @openapi
   * /files:
   *   get:
   *     description: Fetches data (either locally or from GitHub based on config) and returns it as HTML links or JSON based on request headers.
   *     responses:
   *       200:
   *         description: Successful Response
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               description: Data fetched
   *           text/html:
   *             schema:
   *               type: string
   *               description: HTML Links
   *       500:
   *         description: Internal Server Error
   */
  app.get("/files", async (req, res, next) => {
    try {
      const data = await fetchData();
      if (req.isHtmlRequest) {
        const links = objectToLinks("/files", data);
        res.send(links);
      } else if (req.isJsonRequest) {
        res.json(data);
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * Handles GET request on "/files/refresh" route.
   * Fetches data (either locally or from GitHub based on config),
   * recreates the routes dynamically, and redirects to "/files".
   *
   * @name get/files/refresh
   * @path {GET} /files/refresh
   * @code {302} if the server successfully refreshes the data and redirects
   * @code {500} if there is an issue fetching the data and refreshing the routes
   */
  /**
   * Handles GET request on "/files/refresh" route.
   * Fetches data (either locally or from GitHub based on config),
   * recreates the routes dynamically, and redirects to "/files".
   * @openapi
   * /files/refresh:
   *   get:
   *     description: Fetches data (either locally or from GitHub based on config), recreates the routes dynamically, and redirects to "/files".
   *     responses:
   *       302:
   *         description: Data refreshed and redirected to /files
   *       500:
   *         description: Internal Server Error
   */
  app.get("/files/refresh", async (req, res, next) => {
    try {
      const data = await fetchData();
      areRoutesCreated = false;
      if (!areRoutesCreated) {
        createRoutes("/files", data, app);
        areRoutesCreated = true;
      }
      return res.redirect("/files");
    } catch (error) {
      next(error);
    }
  });

  /**
   * Escapes special regex characters in a path segment for use in Express routes.
   * This prevents path-to-regexp from interpreting special characters like parentheses,
   * brackets, etc. as regex syntax. Express decodes URLs before route matching, so we
   * need to escape the decoded path segments.
   * @function escapeRegexChars
   * @param {string} segment - The path segment to escape
   * @returns {string} The escaped path segment
   * @private
   */
  function escapeRegexChars(segment) {
    // Escape special regex characters that path-to-regexp interprets
    // This ensures literal characters like ( ) [ ] are treated as literals, not regex groups
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Decodes URL-encoded path and rebuilds it with regex-escaped segments for route patterns.
   * @function buildRoutePath
   * @param {string} prefix - The current prefix (may be URL-encoded from recursive calls)
   * @param {string} key - The new key to append
   * @returns {string} The route path with regex-escaped segments
   * @private
   */
  function buildRoutePath(prefix, key) {
    // Split the prefix, decode each segment, escape regex chars, then rejoin
    const segments = prefix.split("/").map(segment => {
      if (!segment) return segment; // Empty segments (leading/trailing slashes)
      try {
        const decoded = decodeURIComponent(segment);
        return escapeRegexChars(decoded);
      } catch (e) {
        // If decode fails, segment wasn't encoded, just escape it
        return escapeRegexChars(segment);
      }
    });
    // Add the new key (escaped)
    segments.push(escapeRegexChars(key));
    return segments.join("/");
  }

  /**
   * Create routes dynamically.
   * @function createRoutes
   * @param {string} prefix - The prefix to prepend to the URL (may be URL-encoded from recursive calls)
   * @param {object} obj - The object to extract routes from
   * @param {object} app - The Express.js application instance
   * @private
   */
  function createRoutes(prefix, obj, app) {
    if (obj) {
      Object.entries(obj).forEach(([key, value]) => {
        // Build route path with regex-escaped segments (for Express route registration)
        const routePath = buildRoutePath(prefix, key);
        
        // Build URL-encoded prefix for navigation links (for use in HTML href attributes)
        const encodedKey = encodeURIComponent(key);
        const newPrefix = `${prefix}/${encodedKey}`;

        if (typeof value === "object") {
          app.get(routePath, (req, res) => {
            if (req.isJsonRequest) {
              res.json(value);
            } else if (req.isHtmlRequest) {
              const links = objectToLinks(newPrefix, value);
              res.send(links);
            }
          });
          // Recursively create routes with URL-encoded prefix for proper link generation
          createRoutes(newPrefix, value, app);
        } else {
          app.get(routePath, (req, res) => {
            if (req.isJsonRequest) {
              res.json({ file: value });
            } else if (req.isHtmlRequest) {
              if (value.startsWith("https://github.com/")) {
                // check if the value is a GitHub link
                res.send(`<a href="${value}">${key}</a>`);
              } else {
                res.send(value); // this simply shows file content
              }
            }
          });
        }
      });
    }
  }

  /**
   * Converts object to HTML links.
   * @function objectToLinks
   * @param {string} prefix - The prefix to prepend to the URL
   * @param {object} obj - The object to convert to HTML links
   * @returns {string} HTML representation of links
   * @private
   */
  function objectToLinks(prefix, obj) {
    const links = Object.keys(obj)
      .map((key) => {
        const value = obj[key];
        // URL-encode the key to match the encoded route paths
        const encodedKey = encodeURIComponent(key);
        const url = isUrl(value) ? value : `${prefix}/${encodedKey}`;
        return `<a href="${url}">${key}</a><br>`;
      })
      .join("");

    return `
      <html>
      <body>
        ${links}
      </body>
      </html>
    `;
  }
  /**
   * Validate url
   * @function isUrl
   * @param {?string} str - The string to check
   * @returns {boolean} True if the string is a URL
   * @private
   */
  function isUrl(str) {
    try {
      new URL(str);
      return true;
    } catch (_) {
      return false;
    }
  }
}

export default filesRoutes;
