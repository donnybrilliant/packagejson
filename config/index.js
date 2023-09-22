import { config } from "dotenv";
config();

/** Flag to determine if local data should be used */
const USE_LOCAL_DATA = true;
/** Flag to determine if files should be saved */
const SAVE_FILE = true;
/** Flag to determine if only links should be saved */
const ONLY_SAVE_LINKS = true;

/** Duration of one week in seconds */
const ONE_WEEK = 7 * 24 * 60 * 60;
/** Duration of one month in seconds */
const ONE_MONTH = 4 * ONE_WEEK;

/** Configuration settings related to caching durations */
const CACHE_SETTINGS = {
  ONE_WEEK,
  ONE_MONTH,
};

/** Environment variable configurations */
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

/** Logging settings and configurations */
const LOG_SETTINGS = {
  DIRECTORY: "./logs",
  /** Winston log file name */
  WINSTON: "api_calls.log",
  /** Morgan access log file name */
  MORGAN: "access.log",
};

/** List of recognized image extensions */
const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".tiff",
  ".ico",
  ".pdf",
];

/** List of recognized video extensions */
const VIDEO_EXTENSIONS = [
  ".mp4",
  ".avi",
  ".mov",
  ".mkv",
  ".flv",
  ".webm",
  ".m4v",
];

export {
  ENV,
  CACHE_SETTINGS,
  LOG_SETTINGS,
  USE_LOCAL_DATA,
  SAVE_FILE,
  ONLY_SAVE_LINKS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
};
