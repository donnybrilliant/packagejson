import { ENV } from "../../config/index.js";
import { createDeploymentPlatformClient } from "../utils/deploymentPlatform.js";

/**
 * Transforms Render API response to standardized format
 * @param {Array} data - Raw API response
 * @returns {Array} Transformed site data
 */
function transformRenderData(data) {
  return data.map((site) => ({
    name: site.service?.name || "Unknown",
    url: site.service?.serviceDetails?.url || null,
    repo: site.service?.repo || null,
  }));
}

/**
 * Validates Render API response structure
 * @param {*} data - API response data
 * @returns {boolean} True if valid
 */
function validateRenderResponse(data) {
  return Array.isArray(data);
}

/**
 * Fetches and returns site details from Render for the authenticated user.
 * @async
 * @returns {Promise<Array<Object>|Object>} An array containing details of each site, or an object with an error message.
 */
export const getRenderSites = createDeploymentPlatformClient({
  platformName: "Render",
  tokenEnvVar: "RENDER_TOKEN",
  apiUrl: `${ENV.RENDER_API_URL}/services`,
  transformData: transformRenderData,
  validateResponse: validateRenderResponse,
});
