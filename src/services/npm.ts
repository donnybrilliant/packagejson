import { env } from "@/env";
import { getErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";

/**
 * NPM package information structure
 */
type NpmInfo = {
  name: string;
  description: string | null;
  version?: string | null;
  homepage?: string | null;
  repository?: unknown;
  keywords?: string[];
  license?: unknown;
  author?: unknown;
  maintainers?: unknown[];
  time?: Record<string, unknown>;
  dist_tags?: Record<string, string>;
  versions?: string[];
  latest_version_published?: unknown;
  npm_link: string;
  exists: boolean;
};

const stubPackage = (packageName: string, version?: string): NpmInfo => ({
  name: packageName,
  description: "stub package (test env)",
  version: version ?? "1.0.0",
  homepage: null,
  repository: null,
  keywords: [],
  license: null,
  author: null,
  maintainers: [],
  time: {},
  dist_tags: { latest: version ?? "1.0.0" },
  versions: [version ?? "1.0.0"],
  latest_version_published: null,
  npm_link: `https://www.npmjs.com/package/${packageName}`,
  exists: true,
});

/**
 * Fetches package information from the npm registry
 * @param packageName - Name of the npm package
 * @param latestOnly - If true, only fetch latest version metadata
 * @returns Promise that resolves to package info or null
 */
export const getNpmPackage = async (
  packageName: string,
  latestOnly: boolean
): Promise<NpmInfo | null> => {
  if (!packageName) {
    log("warn", "getNpmPackage called with empty package name");
    return null;
  }

  // Avoid network in tests
  if (env.NODE_ENV === "test") {
    return stubPackage(packageName);
  }

  const apiUrl = latestOnly
    ? `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
    : `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
      log("debug", "NPM package not found", { packageName });
      return null;
    }

    if (!response.ok) {
      log("error", "NPM API error", {
        packageName,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (latestOnly) {
      return {
        name: String(data.name ?? ""),
        version: String(data.version ?? ""),
        description:
          typeof data.description === "string" ? data.description : null,
        homepage: typeof data.homepage === "string" ? data.homepage : null,
        repository: data.repository ?? null,
        keywords: Array.isArray(data.keywords)
          ? (data.keywords as string[])
          : [],
        license: data.license ?? null,
        author: data.author ?? null,
        npm_link: `https://www.npmjs.com/package/${packageName}`,
        exists: true,
        maintainers: [],
        time: {},
        dist_tags: {},
        versions: [],
        latest_version_published: null,
      };
    }

    const distTags = data["dist-tags"] as Record<string, string> | undefined;
    const latestVersion = distTags?.latest ?? null;
    const versions = data.versions as Record<string, unknown> | undefined;
    const latestVersionData =
      latestVersion && versions
        ? (versions[latestVersion] as Record<string, unknown>)
        : null;

    return {
      name: String(data.name ?? ""),
      description:
        typeof data.description === "string" ? data.description : null,
      version: latestVersion,
      homepage:
        latestVersionData?.homepage ?? data.homepage
          ? String(latestVersionData?.homepage ?? data.homepage ?? "")
          : null,
      repository: latestVersionData?.repository ?? data.repository ?? null,
      keywords: Array.isArray(latestVersionData?.keywords ?? data.keywords)
        ? ((latestVersionData?.keywords ?? data.keywords) as string[])
        : [],
      license: latestVersionData?.license ?? data.license ?? null,
      author: latestVersionData?.author ?? data.author ?? null,
      maintainers: Array.isArray(data.maintainers)
        ? (data.maintainers as unknown[])
        : [],
      time:
        data.time && typeof data.time === "object" && !Array.isArray(data.time)
          ? (data.time as Record<string, unknown>)
          : {},
      dist_tags: distTags ?? {},
      versions: versions ? Object.keys(versions) : [],
      latest_version_published: latestVersionData?.publishTime ?? null,
      npm_link: `https://www.npmjs.com/package/${packageName}`,
      exists: true,
    };
  } catch (error) {
    log("error", "Error fetching NPM package", {
      packageName,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Search for npm packages
 * @param query - Search query text
 * @param options - Search options (size, from, quality, popularity, maintenance)
 * @returns Promise that resolves to search results or null
 */
export const searchNpmPackages = async (
  query: string,
  options?: {
    size?: number;
    from?: number;
    quality?: number;
    popularity?: number;
    maintenance?: number;
  }
): Promise<{
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      keywords?: string[];
      date: string;
      links: {
        npm: string;
        homepage?: string;
        repository?: string;
      };
      publisher: {
        username: string;
        email: string;
      };
      maintainers: Array<{ username: string; email: string }>;
    };
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
  }>;
  total: number;
  time: string;
} | null> => {
  if (!query) {
    log("warn", "searchNpmPackages called with empty query");
    return null;
  }

  if (env.NODE_ENV === "test") {
    return {
      objects: [],
      total: 0,
      time: new Date().toISOString(),
    };
  }

  try {
    const params = new URLSearchParams();
    params.append("text", query);
    if (options?.size) params.append("size", String(options.size));
    if (options?.from) params.append("from", String(options.from));
    if (options?.quality !== undefined)
      params.append("quality", String(options.quality));
    if (options?.popularity !== undefined)
      params.append("popularity", String(options.popularity));
    if (options?.maintenance !== undefined)
      params.append("maintenance", String(options.maintenance));

    const response = await fetch(
      `https://registry.npmjs.org/-/v1/search?${params.toString()}`,
      {
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      log("error", "NPM search API error", {
        query,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as {
      objects?: unknown[];
      total?: number;
      time?: string;
    };

    return {
      objects: Array.isArray(data.objects) ? (data.objects as never) : [],
      total: typeof data.total === "number" ? data.total : 0,
      time:
        typeof data.time === "string" ? data.time : new Date().toISOString(),
    };
  } catch (error) {
    log("error", "Error searching NPM packages", {
      query,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches download statistics for an npm package
 * @param packageName - Package name
 * @param period - Time period: "last-day", "last-week", "last-month", "last-year"
 * @returns Promise that resolves to download stats or null
 */
export const getNpmPackageDownloads = async (
  packageName: string,
  period: "last-day" | "last-week" | "last-month" | "last-year" = "last-week"
): Promise<{
  downloads: number;
  start: string;
  end: string;
  package: string;
} | null> => {
  if (!packageName) {
    log("warn", "getNpmPackageDownloads called with empty package name");
    return null;
  }

  if (env.NODE_ENV === "test") {
    return {
      downloads: 0,
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      package: packageName,
    };
  }

  try {
    const response = await fetch(
      `https://api.npmjs.org/downloads/point/${period}/${encodeURIComponent(
        packageName
      )}`,
      {
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      log("debug", "NPM downloads API error", {
        packageName,
        period,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as {
      downloads?: number;
      start?: string;
      end?: string;
      package?: string;
    };

    return {
      downloads: typeof data.downloads === "number" ? data.downloads : 0,
      start:
        typeof data.start === "string" ? data.start : new Date().toISOString(),
      end: typeof data.end === "string" ? data.end : new Date().toISOString(),
      package: data.package ?? packageName,
    };
  } catch (error) {
    log("error", "Error fetching NPM downloads", {
      packageName,
      period,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches a specific version of an npm package
 * @param packageName - Package name
 * @param version - Version string (e.g., "1.0.0", "latest", "beta")
 * @returns Promise that resolves to version info or null
 */
export const getNpmPackageVersion = async (
  packageName: string,
  version: string
): Promise<NpmInfo | null> => {
  if (!packageName || !version) {
    log("warn", "getNpmPackageVersion called with empty parameters");
    return null;
  }

  if (env.NODE_ENV === "test") {
    return stubPackage(packageName);
  }

  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(
        packageName
      )}/${encodeURIComponent(version)}`,
      {
        headers: { Accept: "application/json" },
      }
    );

    if (response.status === 404) {
      log("debug", "NPM package version not found", { packageName, version });
      return null;
    }

    if (!response.ok) {
      log("error", "NPM API error", {
        packageName,
        version,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      name: String(data.name ?? ""),
      version: String(data.version ?? ""),
      description:
        typeof data.description === "string" ? data.description : null,
      homepage: typeof data.homepage === "string" ? data.homepage : null,
      repository: data.repository ?? null,
      keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
      license: data.license ?? null,
      author: data.author ?? null,
      npm_link: `https://www.npmjs.com/package/${packageName}`,
      exists: true,
      maintainers: [],
      time: {},
      dist_tags: {},
      versions: [],
      latest_version_published: null,
    };
  } catch (error) {
    log("error", "Error fetching NPM package version", {
      packageName,
      version,
      error: getErrorMessage(error),
    });
    return null;
  }
};
