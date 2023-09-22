import { filesCache } from "../utils/cache.js";
import { getRepositories, fetchFolderStructure } from "../services/github.js";
import { logger } from "../middleware/logger.js";
import fs from "fs";
import { USE_LOCAL_DATA, SAVE_FILE } from "../../config/index.js";
import path from "path";
import { fileURLToPath } from "url";
import handleResponseType from "../middleware/handleResponseType.js";

let areRoutesCreated = false;

function getLocalData() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rawData = fs.readFileSync(
    path.join(__dirname, "../../data.json"),
    "utf8"
  );
  return JSON.parse(rawData);
}

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

function filesRoutes(app) {
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

  app.use("/files", ensureDataLoaded, handleResponseType);

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
