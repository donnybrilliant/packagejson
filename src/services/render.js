import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

/**
 * Fetches and returns site details from Render for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>>} An array containing details of each site. Each object includes the site's name, URL, and repository link.
 * @throws Will log an error if any issues occur during the API call.
 */
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
