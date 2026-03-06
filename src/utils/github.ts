import { log } from "./logger";
import { isErrorResponse } from "./errors";

/**
 * Handles GitHub API response, checking for errors and rate limits
 * @param response - Fetch response object
 * @returns Promise that resolves to the JSON data or null on error
 */
export const handleGitHubResponse = async (
  response: Response,
  endpoint: string
): Promise<unknown | null> => {
  if (response.status === 403) {
    log("error", "GitHub API rate limit exceeded", { endpoint });
    return null;
  }

  if (response.status === 202) {
    // GitHub returns 202 Accepted when stats are being calculated
    log("warn", "GitHub API stats being calculated", { endpoint });
    return null;
  }

  if (response.status === 404) {
    const errorData = (await response.json()) as { message?: string };
    return errorData; // Return error object so calling functions can check for data.message
  }

  if (!response.ok) {
    log("error", "GitHub API error", {
      endpoint,
      status: response.status,
      statusText: response.statusText,
    });
    return null;
  }

  return response.json();
};

/**
 * Validates and extracts data from GitHub API response
 * @param data - Response data from GitHub API
 * @returns true if data is valid (not an error), false otherwise
 */
export const isValidGitHubResponse = (data: unknown): boolean => {
  return data !== null && !isErrorResponse(data);
};

