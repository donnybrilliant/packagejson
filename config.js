import { config } from "dotenv";
config();

export const ENV = {
  GITHUB_API_URL: process.env.GITHUB_API_URL,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  USERNAME: process.env.USERNAME,
  PORT: process.env.PORT || 3000,
};
