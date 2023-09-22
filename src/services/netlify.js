import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

/**
 * Fetches and returns site details from Netlify for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>>} An array containing details of each site. Each object includes the site's name, URLs, image, repository link, and Node.js version.
 * @throws Will log an error if any issues occur during the API call.
 */
export async function getNetlifySites() {
  try {
    const response = await fetch(`${ENV.NETLIFY_API_URL}/sites`, {
      headers: {
        Authorization: `Bearer ${ENV.NETLIFY_TOKEN}`,
      },
    });
    const data = await response.json();
    logger.info(
      `API call to ${ENV.NETLIFY_API_URL}/sites with status ${response.status} ${response.statusText}`
    );

    return data.map((site) => ({
      name: site.name,
      url: site.url,
      ssl_url: site.ssl_url,
      img: site.screenshot_url,
      repo: site.build_settings.repo_url,
      node: site.versions.node,
    }));
  } catch (error) {
    logger.error(`Error in getNetlifySites: ${error.message}`);
  }
}
