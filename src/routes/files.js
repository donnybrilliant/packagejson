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
        const folderStructure = await fetchFolderStructure(repo.name);
        if (folderStructure) {
          data[repo.name] = folderStructure;
        } else {
          logger.error(
            `fetchFolderStructure returned falsy value for repo: ${repo.name}`
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
      next(error);
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
  app.get("/files/refresh", async (req, res) => {
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
   * Create routes dynamically.
   * @function createRoutes
   * @param {string} prefix - The prefix to prepend to the URL
   * @param {object} obj - The object to extract routes from
   * @param {object} app - The Express.js application instance
   * @private
   */
  function createRoutes(prefix, obj, app) {
    if (obj) {
      Object.entries(obj).forEach(([key, value]) => {
        const newPrefix = `${prefix}/${key}`;

        if (typeof value === "object") {
          app.get(newPrefix, (req, res) => {
            if (req.isJsonRequest) {
              res.json(value);
            } else if (req.isHtmlRequest) {
              const links = objectToLinks(newPrefix, value);
              res.send(links);
            }
          });
          createRoutes(newPrefix, value, app);
        } else {
          app.get(newPrefix, (req, res) => {
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
        const url = isUrl(value) ? value : `${prefix}/${key}`;
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
