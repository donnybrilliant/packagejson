import { config } from "dotenv";
config();

const ENV = {
  GITHUB_API_URL: process.env.GITHUB_API_URL || "https://api.github.com",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  USERNAME: process.env.USERNAME,
  NETLIFY_API_URL:
    process.env.NETLIFY_API_URL || "https://api.netlify.com/api/v1",
  NETLIFY_API_TOKEN: process.env.NETLIFY_API_TOKEN,
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
};

const ONE_WEEK = 7 * 24 * 60 * 60;
const ONE_MONTH = 4 * ONE_WEEK;

const CACHE_SETTINGS = {
  ONE_WEEK,
  ONE_MONTH,
};

const LOG_SETTINGS = {
  DIRECTORY: "./logs",
  WINSTON: "api_calls.log",
  MORGAN: "access.log",
};

const USE_LOCAL_DATA = false;

export { ENV, CACHE_SETTINGS, LOG_SETTINGS, USE_LOCAL_DATA };
