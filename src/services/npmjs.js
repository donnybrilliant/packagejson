import fetch from "node-fetch";
import { logger } from "../middleware/logger.js";

/**
 * Fetches package information from npmjs registry API
 * @async
 * @param {string} packageName - The name of the npm package
 * @returns {Promise<Object|null>} Package information from npmjs, or null if not found
 */
export async function getNpmPackageInfo(packageName) {
  try {
    if (!packageName || typeof packageName !== "string") {
      return null;
    }

    // npmjs registry API endpoint (public, no authentication required)
    const apiUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    logger.info(
      `npmjs API call to ${apiUrl} with status ${response.status} ${response.statusText}`
    );

    if (response.status === 404) {
      // Package doesn't exist on npmjs
      return null;
    }

    if (!response.ok) {
      logger.error(
        `npmjs API error (${response.status}): ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();

    // Extract useful information from the npmjs API response
    const latestVersion = data["dist-tags"]?.latest || null;
    const latestVersionData = latestVersion
      ? data.versions?.[latestVersion]
      : null;

    return {
      name: data.name,
      description: data.description || null,
      version: latestVersion,
      homepage: latestVersionData?.homepage || data.homepage || null,
      repository: latestVersionData?.repository || data.repository || null,
      keywords: latestVersionData?.keywords || data.keywords || [],
      license: latestVersionData?.license || data.license || null,
      author: latestVersionData?.author || data.author || null,
      maintainers: data.maintainers || [],
      time: data.time || {},
      dist_tags: data["dist-tags"] || {},
      versions: Object.keys(data.versions || {}),
      latest_version_published: latestVersionData?.publishTime || null,
      npm_link: `https://www.npmjs.com/package/${packageName}`,
      exists: true,
    };
  } catch (error) {
    logger.error(`Error in getNpmPackageInfo: ${error.message}`);
    return null;
  }
}

/**
 * Fetches latest version information for a package
 * @async
 * @param {string} packageName - The name of the npm package
 * @returns {Promise<Object|null>} Latest version information, or null if not found
 */
export async function getNpmPackageLatest(packageName) {
  try {
    if (!packageName || typeof packageName !== "string") {
      return null;
    }

    // npmjs registry API endpoint for latest version only
    const apiUrl = `https://registry.npmjs.org/${encodeURIComponent(
      packageName
    )}/latest`;

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    logger.info(
      `npmjs API call to ${apiUrl} with status ${response.status} ${response.statusText}`
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      logger.error(
        `npmjs API error (${response.status}): ${response.statusText}`
      );
      return null;
    }

    const data = await response.json();

    return {
      name: data.name,
      version: data.version,
      description: data.description || null,
      homepage: data.homepage || null,
      repository: data.repository || null,
      keywords: data.keywords || [],
      license: data.license || null,
      author: data.author || null,
      npm_link: `https://www.npmjs.com/package/${packageName}`,
      exists: true,
    };
  } catch (error) {
    logger.error(`Error in getNpmPackageLatest: ${error.message}`);
    return null;
  }
}

