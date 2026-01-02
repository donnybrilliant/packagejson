import { createLogger, format, transports } from "winston";
import { LOG_SETTINGS } from "../../config/index.js";
import fs from "fs";
import path from "path";

const { combine, timestamp, label, printf } = format;

/**
 * A custom logger for an application.
 * @type {winston.Logger}
 * @constant
 * @namespace logger
 */
export const logger = createLogger({
  level: "info",
  format: combine(
    label({ label: "packagejson" }),
    timestamp(),
    printf(({ level, message, label, timestamp }) => {
      return `${timestamp} [${label}] ${level}: ${message}`;
    })
  ),
  defaultMeta: { service: "user-service" },
  transports: [
    new transports.File({
      filename: path.join(LOG_SETTINGS.DIRECTORY, LOG_SETTINGS.WINSTON),
      handleExceptions: true,
    }),
    new transports.Console(),
  ],
});

const accessLogStream = fs.createWriteStream(
  path.join(LOG_SETTINGS.DIRECTORY, LOG_SETTINGS.MORGAN),
  { flags: "a" }
);

/**
 * Configuration for morgan middleware - for logging HTTP requests.
 * @type {{format: string, options: {stream: WriteStream}}}
 * @constant
 * @namespace morganConfig
 */
export const morganConfig = {
  format:
    ":remote-addr :remote-user [:date[clf]] ':method :url HTTP/:http-version' :status :response-time ms :res[content-length] ':referrer' ':user-agent'",
  options: {
    stream: accessLogStream,
  },
};
