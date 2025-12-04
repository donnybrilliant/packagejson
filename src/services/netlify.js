import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

/**
 * Fetches and returns site details from Netlify for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>|Object>} An array containing details of each site, or an object with an error message.
 * @throws Will log an error if any issues occur during the API call.
 */
export async function getNetlifySites() {
  try {
    // Check if token is configured
    if (!ENV.NETLIFY_TOKEN) {
      return {
        message: "Netlify API token is not configured. Please set NETLIFY_TOKEN in your environment variables.",
        configured: false,
      };
    }

    const response = await fetch(`${ENV.NETLIFY_API_URL}/sites`, {
      headers: {
        Authorization: `Bearer ${ENV.NETLIFY_TOKEN}`,
      },
    });
    
    logger.info(
      `API call to ${ENV.NETLIFY_API_URL}/sites with status ${response.status} ${response.statusText}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Netlify API error (${response.status}): ${errorText}`);
      
      if (response.status === 401 || response.status === 403) {
        return {
          message: "Netlify API authentication failed. Please check your NETLIFY_TOKEN.",
          configured: true,
          error: errorText,
        };
      }
      
      return {
        message: `Netlify API error: ${response.status} ${response.statusText}`,
        configured: true,
        error: errorText,
      };
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      logger.error(`Netlify API returned unexpected data format: ${typeof data}`);
      return {
        message: "Netlify API returned unexpected data format.",
        configured: true,
      };
    }

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
    return {
      message: `Error fetching Netlify sites: ${error.message}`,
      configured: !!ENV.NETLIFY_TOKEN,
    };
  }
}
