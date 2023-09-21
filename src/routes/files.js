import { filesCache } from "../utils/cache.js";
import { getRepositories, fetchFolderStructure } from "../services/github.js";
import { logger } from "../middleware/logger.js";
import fs from "fs";
import { USE_LOCAL_DATA } from "../../config/index.js";
import path from "path";
import { fileURLToPath } from "url";

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
    filesCache.set("files", data);
    return data;
  } catch (error) {
    logger.error(`Error in fetchData: ${error.message}`);
    throw error;
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
      throw error;
    }
  }

  app.use("/files/*", ensureDataLoaded);

  app.get("/files", async (req, res) => {
    try {
      const data = await fetchData();
      return res.json(data);
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
      return res.json(data);
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
            res.json(value);
          });
          createRoutes(newPrefix, value, app);
        } else {
          app.get(newPrefix, (req, res) => {
            res.send(value);
          });
        }
      });
    }
  }
}

export default filesRoutes;
