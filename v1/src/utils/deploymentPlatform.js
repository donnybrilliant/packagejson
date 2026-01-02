import fetch from "node-fetch";
import { logger } from "../middleware/logger.js";

/**
 * Creates a standardized deployment platform API client
 * @param {Object} config - Configuration object
 * @param {string} config.platformName - Name of the platform (for logging)
 * @param {string} config.tokenEnvVar - Environment variable name for the token
 * @param {string} config.apiUrl - Base API URL
 * @param {Function} config.transformData - Function to transform the API response
 * @param {Function} config.validateResponse - Function to validate the response structure
 * @returns {Function} Function to fetch sites from the platform
 */
export function createDeploymentPlatformClient(config) {
  const { platformName, tokenEnvVar, apiUrl, transformData, validateResponse } = config;

  return async function fetchSites() {
    try {
      const token = process.env[tokenEnvVar];

      // Check if token is configured
      if (!token) {
        return {
          message: `${platformName} API token is not configured. Please set ${tokenEnvVar} in your environment variables.`,
          configured: false,
        };
      }

      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      logger.info(
        `API call to ${apiUrl} with status ${response.status} ${response.statusText}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`${platformName} API error (${response.status}): ${errorText}`);

        if (response.status === 401 || response.status === 403) {
          return {
            message: `${platformName} API authentication failed. Please check your ${tokenEnvVar}.`,
            configured: true,
            error: errorText,
          };
        }

        return {
          message: `${platformName} API error: ${response.status} ${response.statusText}`,
          configured: true,
          error: errorText,
        };
      }

      const data = await response.json();

      // Validate response structure
      if (validateResponse && !validateResponse(data)) {
        logger.error(`${platformName} API returned unexpected data format`);
        return {
          message: `${platformName} API returned unexpected data format.`,
          configured: true,
        };
      }

      // Transform data
      return transformData ? transformData(data) : data;
    } catch (error) {
      logger.error(`Error in fetch${platformName}Sites: ${error.message}`);
      return {
        message: `Error fetching ${platformName} sites: ${error.message}`,
        configured: !!process.env[tokenEnvVar],
      };
    }
  };
}

/**
 * Creates a standardized route handler for deployment platform endpoints
 * @param {Function} fetchSitesFn - Function to fetch sites from the platform
 * @returns {Function} Express route handler
 */
export function createDeploymentPlatformRoute(fetchSitesFn) {
  return async (req, res, next) => {
    try {
      const data = await fetchSitesFn();
      return res.json(data);
    } catch (error) {
      next(error);
    }
  };
}

