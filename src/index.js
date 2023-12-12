import { ENV } from "../config/index.js";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import { morganConfig } from "./middleware/logger.js";
import indexRoutes from "./routes/index.js";
import reposRoutes from "./routes/repos.js";
import packageRoutes from "./routes/package.js";
import filesRoutes from "./routes/files.js";
import netlifyRoutes from "./routes/netlify.js";
import renderRoutes from "./routes/render.js";
import vercelRoutes from "./routes/vercel.js";
import errorHandler from "./middleware/errorHandler.js";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerOptions from "../swaggerOptions.js";

/**
 * Initialize Express application
 * @type {express.Application}
 */
const app = express();

/**
 * Enable CORS for all routes
 */
app.use(cors());

/**
 * Use morgan middleware for logging incoming requests
 */
app.use(morgan(morganConfig.format, morganConfig.options));

/**
 * Register routes
 */
indexRoutes(app);
reposRoutes(app);
packageRoutes(app);
filesRoutes(app);
netlifyRoutes(app);
renderRoutes(app);
vercelRoutes(app);

/**
 * Integrate Swagger after registering other routes
 */
const specs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

/**
 * Use error handling middleware
 */
app.use(errorHandler);

/**
 * Start the server and listen on a port
 */
app.listen(ENV.PORT, () => {
  console.log(`Server is running on http://localhost:${ENV.PORT}`);
});
