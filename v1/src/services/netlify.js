import { ENV } from "../../config/index.js";
import { createDeploymentPlatformClient } from "../utils/deploymentPlatform.js";

/**
 * Transforms Netlify API response to standardized format
 * @param {Array} data - Raw API response
 * @returns {Array} Transformed site data
 */
function transformNetlifyData(data) {
  return data.map((site) => ({
    name: site.name,
    url: site.url,
    ssl_url: site.ssl_url,
    img: site.screenshot_url,
    repo: site.build_settings?.repo_url || null,
    node: site.versions?.node || null,
  }));
}

/**
 * Validates Netlify API response structure
 * @param {*} data - API response data
 * @returns {boolean} True if valid
 */
function validateNetlifyResponse(data) {
  return Array.isArray(data);
}

/**
 * Fetches and returns site details from Netlify for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>|Object>} An array containing details of each site, or an object with an error message.
 */
export const getNetlifySites = createDeploymentPlatformClient({
  platformName: "Netlify",
  tokenEnvVar: "NETLIFY_TOKEN",
  apiUrl: `${ENV.NETLIFY_API_URL}/sites`,
  transformData: transformNetlifyData,
  validateResponse: validateNetlifyResponse,
});
