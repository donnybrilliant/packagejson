import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

/**
 * Fetches and returns site details from Vercel for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>>} An array containing details of each site. Each object includes the site's name, URL, repository link, framework, and node version.
 * @throws Will log an error if any issues occur during the API call.
 */
export async function getVercelSites() {
  try {
    const response = await fetch(`${ENV.VERCEL_API_URL}/v9/projects`, {
      headers: {
        Authorization: `Bearer ${ENV.VERCEL_TOKEN}`,
      },
    });
    const data = await response.json();
    logger.info(
      `API call to ${ENV.VERCEL_API_URL}/sites with status ${response.status} ${response.statusText}`
    );

    return data.projects.map((site) => ({
      name: site.name,
      url: "https://" + site.latestDeployments[0].alias[0],
      repo: `https://${site.link.type}.com/${site.link.org}/${site.link.repo}`,
      framework: site.framework,
      node: site.nodeVersion,
    }));
  } catch (error) {
    logger.error(`Error in getVercelSites: ${error.message}`);
  }
}
