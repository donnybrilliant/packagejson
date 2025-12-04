import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

/**
 * Fetches and returns site details from Vercel for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>|Object>} An array containing details of each site, or an object with an error message.
 * @throws Will log an error if any issues occur during the API call.
 */
export async function getVercelSites() {
  try {
    // Check if token is configured
    if (!ENV.VERCEL_TOKEN) {
      return {
        message: "Vercel API token is not configured. Please set VERCEL_TOKEN in your environment variables.",
        configured: false,
      };
    }

    const response = await fetch(`${ENV.VERCEL_API_URL}/v9/projects`, {
      headers: {
        Authorization: `Bearer ${ENV.VERCEL_TOKEN}`,
      },
    });
    
    logger.info(
      `API call to ${ENV.VERCEL_API_URL}/v9/projects with status ${response.status} ${response.statusText}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Vercel API error (${response.status}): ${errorText}`);
      
      if (response.status === 401 || response.status === 403) {
        return {
          message: "Vercel API authentication failed. Please check your VERCEL_TOKEN.",
          configured: true,
          error: errorText,
        };
      }
      
      return {
        message: `Vercel API error: ${response.status} ${response.statusText}`,
        configured: true,
        error: errorText,
      };
    }

    const data = await response.json();
    
    if (!data || !data.projects || !Array.isArray(data.projects)) {
      logger.error(`Vercel API returned unexpected data format`);
      return {
        message: "Vercel API returned unexpected data format.",
        configured: true,
      };
    }

    return data.projects.map((site) => {
      // Safely extract URL from latest deployment
      let url = null;
      if (
        site.latestDeployments &&
        Array.isArray(site.latestDeployments) &&
        site.latestDeployments.length > 0 &&
        site.latestDeployments[0].alias &&
        Array.isArray(site.latestDeployments[0].alias) &&
        site.latestDeployments[0].alias.length > 0
      ) {
        url = "https://" + site.latestDeployments[0].alias[0];
      }

      // Safely extract repo URL
      let repo = null;
      if (site.link && site.link.type && site.link.org && site.link.repo) {
        repo = `https://${site.link.type}.com/${site.link.org}/${site.link.repo}`;
      }

      return {
        name: site.name || "Unknown",
        url: url,
        repo: repo,
        framework: site.framework || null,
        node: site.nodeVersion || null,
      };
    });
  } catch (error) {
    logger.error(`Error in getVercelSites: ${error.message}`);
    return {
      message: `Error fetching Vercel sites: ${error.message}`,
      configured: !!ENV.VERCEL_TOKEN,
    };
  }
}
