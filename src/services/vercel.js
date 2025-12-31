import { ENV } from "../../config/index.js";
import { createDeploymentPlatformClient } from "../utils/deploymentPlatform.js";

/**
 * Transforms Vercel API response to standardized format
 * @param {Object} data - Raw API response
 * @returns {Array} Transformed site data
 */
function transformVercelData(data) {
  if (!data?.projects || !Array.isArray(data.projects)) {
    return [];
  }

  return data.projects.map((site) => {
    // Safely extract URL from latest deployment
    let url = null;
    if (site.latestDeployments?.[0]?.alias?.[0]) {
      url = `https://${site.latestDeployments[0].alias[0]}`;
    }

    // Safely extract repo URL
    let repo = null;
    if (site.link?.type && site.link?.org && site.link?.repo) {
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
}

/**
 * Validates Vercel API response structure
 * @param {*} data - API response data
 * @returns {boolean} True if valid
 */
function validateVercelResponse(data) {
  return data && data.projects && Array.isArray(data.projects);
}

/**
 * Fetches and returns site details from Vercel for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>|Object>} An array containing details of each site, or an object with an error message.
 */
export const getVercelSites = createDeploymentPlatformClient({
  platformName: "Vercel",
  tokenEnvVar: "VERCEL_TOKEN",
  apiUrl: `${ENV.VERCEL_API_URL}/v9/projects`,
  transformData: transformVercelData,
  validateResponse: validateVercelResponse,
});
