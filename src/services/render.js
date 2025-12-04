import fetch from "node-fetch";
import { ENV } from "../../config/index.js";
import { logger } from "../middleware/logger.js";

/**
 * Fetches and returns site details from Render for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>|Object>} An array containing details of each site, or an object with an error message.
 * @throws Will log an error if any issues occur during the API call.
 */
export async function getRenderSites() {
  try {
    // Check if token is configured
    if (!ENV.RENDER_TOKEN) {
      return {
        message: "Render API token is not configured. Please set RENDER_TOKEN in your environment variables.",
        configured: false,
      };
    }

    const response = await fetch(`${ENV.RENDER_API_URL}/services`, {
      headers: {
        Authorization: `Bearer ${ENV.RENDER_TOKEN}`,
      },
    });
    
    logger.info(
      `API call to ${ENV.RENDER_API_URL}/services with status ${response.status} ${response.statusText}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Render API error (${response.status}): ${errorText}`);
      
      if (response.status === 401 || response.status === 403) {
        return {
          message: "Render API authentication failed. Please check your RENDER_TOKEN.",
          configured: true,
          error: errorText,
        };
      }
      
      return {
        message: `Render API error: ${response.status} ${response.statusText}`,
        configured: true,
        error: errorText,
      };
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      logger.error(`Render API returned unexpected data format: ${typeof data}`);
      return {
        message: "Render API returned unexpected data format.",
        configured: true,
      };
    }

    return data.map((site) => ({
      name: site.service.name,
      url: site.service.serviceDetails.url,
      repo: site.service.repo,
    }));
  } catch (error) {
    logger.error(`Error in getRenderSites: ${error.message}`);
    return {
      message: `Error fetching Render sites: ${error.message}`,
      configured: !!ENV.RENDER_TOKEN,
    };
  }
}
