import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

export async function getRenderSites() {
  try {
    const response = await fetch(`${ENV.RENDER_API_URL}/services`, {
      headers: {
        Authorization: `Bearer ${ENV.RENDER_TOKEN}`,
      },
    });
    const data = await response.json();
    logger.info(
      `API call to ${ENV.RENDER_API_URL}/sites with status ${response.status} ${response.statusText}`
    );
    return data.map((site) => ({
      name: site.service.name,
      url: site.service.serviceDetails.url,
      repo: site.service.repo,
    }));
  } catch (error) {
    logger.error(`Error in getRenderSites: ${error.message}`);
  }
}
