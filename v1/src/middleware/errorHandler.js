/**
 * ErrorHandler imports the logger from logger.js and defines middleware for express.js.
 * It logs the error message with the timestamp, stack trace and url, and sends a JSON response with the error message and stack trace
 * @module errorHandler
 * @requires "../logger"
 */

import { logger } from "./logger.js";

/**
 * @function
 * @name errorHandler
 * @param {object} err - The error object.
 * @param {object} req - The HTTP request object.
 * @param {object} res - The HTTP response object.
 * @param {function} next - The next middleware function.
 * @returns {object} - The status of the error and the error message in JSON format
 */
function errorHandler(err, req, res, next) {
  logger.error(`Error: ${err.message}`, {
    timestamp: new Date().toISOString(),
    stack: err.stack,
    url: req.originalUrl,
  });

  let status = err.status || 500;
  let response = {
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
  };

  return res.status(status).json(response);
}

export default errorHandler;
