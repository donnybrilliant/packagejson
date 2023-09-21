import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

export async function getNetlifySites() {
  try {
    const response = await fetch(`${ENV.NETLIFY_API_URL}/sites`, {
      headers: {
        Authorization: `Bearer ${ENV.NETLIFY_API_TOKEN}`,
      },
    });
    const data = await response.json();
    logger.info(
      `API call to ${ENV.NETLIFY_API_URL}/sites with status ${response.status} ${response.statusText}`
    );
    return data.map((site) => ({
      name: site.name,
      url: site.url,
      img: site.screenshot_url,
    }));
  } catch (error) {
    logger.error(`Error in fetchGitHubAPI: ${error.message}`);
    throw error;
  }
}
