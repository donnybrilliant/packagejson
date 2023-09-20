import { filesCache } from "../utils/cache.js";
import { getRepositories, fetchFolderStructure } from "../services/api.js";
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
  if (filesCache.get("files")) {
    console.log("fetching data from cache");
    return filesCache.get("files");
  }
  let data = {};
  if (USE_LOCAL_DATA) {
    console.log("fetching local data");
    data = getLocalData();
  } else {
    const repos = await getRepositories();
    for (const repo of repos) {
      const folderStructure = await fetchFolderStructure(repo.name);
      if (folderStructure) {
        data[repo.name] = folderStructure;
      } else {
        console.error(
          `fetchFolderStructure returned falsy value for repo: ${repo.name}`
        );
      }
    }
  }
  filesCache.set("files", data);
  return data;
}

function filesRoutes(app) {
  function ensureDataLoaded(req, res, next) {
    if (!filesCache.get("files")) {
      console.log("Data not loaded, loading data...");
      loadDataAndCreateRoutes()
        .then(() => {
          next();
        })
        .catch((error) => {
          console.error(error);
          res.status(500).json({ error: error.message });
        });
    } else {
      next();
    }
  }

  async function loadDataAndCreateRoutes() {
    const data = await fetchData();
    if (!areRoutesCreated) {
      createRoutes("/files", data, app);
      areRoutesCreated = true;
    }
  }

  app.use("/files/*", ensureDataLoaded);

  app.get("/files", async (req, res) => {
    try {
      const data = await fetchData();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/files/refresh", async (req, res) => {
    try {
      const data = await fetchData();
      // reset areRoutesCreated flag to force routes creation again
      areRoutesCreated = false;
      if (!areRoutesCreated) {
        createRoutes("/files", data, app);
        areRoutesCreated = true;
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // A recursive function to create routes from the files object
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
