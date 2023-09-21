import { config } from "dotenv";
config();

const ENV = {
  USERNAME: process.env.USERNAME,
  GITHUB_API_URL: process.env.GITHUB_API_URL || "https://api.github.com",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  NETLIFY_API_URL:
    process.env.NETLIFY_API_URL || "https://api.netlify.com/api/v1",
  NETLIFY_TOKEN: process.env.NETLIFY_TOKEN,
  VERCEL_API_URL: process.env.VERCEL_API_URL || "https://api.vercel.com",
  VERCEL_TOKEN: process.env.VERCEL_TOKEN,
  RENDER_API_URL: process.env.RENDER_API_URL || "https://api.render.com/v1",
  RENDER_TOKEN: process.env.RENDER_TOKEN,
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
