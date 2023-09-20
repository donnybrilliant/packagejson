import { logger } from "./logger.js";

function errorHandler(err, req, res, next) {
  logger.error(`Error: ${err.message}`, {
    timestamp: new Date().toISOString(),
    stack: err.stack,
    url: req.originalUrl,
  });

  res.status(err.status || 500);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
  });
}

export default errorHandler;
