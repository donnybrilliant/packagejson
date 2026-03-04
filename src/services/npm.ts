import { env } from "@/env";
import { getErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";

export type NpmInfo = {
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

const TEST_PUBLISHED_PACKAGES = new Set<string>(["@test/test-repo"]);

const stubPackage = (packageName: string): NpmInfo => ({
  name: packageName,
  description: "stub package (test env)",
  version: "1.0.0",
  homepage: null,
  repository: null,
  keywords: [],
  license: null,
  author: null,
  maintainers: [],
  time: {},
  dist_tags: { latest: "1.0.0" },
  versions: ["1.0.0"],
  latest_version_published: null,
  npm_link: `https://www.npmjs.com/package/${packageName}`,
  exists: true,
});

export const getNpmPackage = async (
  packageName: string,
  latestOnly: boolean
): Promise<NpmInfo | null> => {
  if (!packageName) {
    log("warn", "getNpmPackage called with empty package name");
    return null;
  }

  if (env.NODE_ENV === "test") {
    return TEST_PUBLISHED_PACKAGES.has(packageName) ? stubPackage(packageName) : null;
  }

  const apiUrl = latestOnly
    ? `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`
    : `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
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
        name: String(data.name ?? packageName),
        version: typeof data.version === "string" ? data.version : null,
        description: typeof data.description === "string" ? data.description : null,
        homepage: typeof data.homepage === "string" ? data.homepage : null,
        repository: data.repository ?? null,
        keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
        license: data.license ?? null,
        author: data.author ?? null,
        maintainers: [],
        time: {},
        dist_tags: {},
        versions: [],
        latest_version_published: null,
        npm_link: `https://www.npmjs.com/package/${packageName}`,
        exists: true,
      };
    }

    const distTags = data["dist-tags"] as Record<string, string> | undefined;
    const latestVersion = distTags?.latest ?? null;
    const versions = data.versions as Record<string, unknown> | undefined;
    const latestVersionData =
      latestVersion && versions
        ? (versions[latestVersion] as Record<string, unknown> | undefined)
        : undefined;

    return {
      name: String(data.name ?? packageName),
      description: typeof data.description === "string" ? data.description : null,
      version: latestVersion,
      homepage:
        typeof latestVersionData?.homepage === "string"
          ? latestVersionData.homepage
          : typeof data.homepage === "string"
            ? data.homepage
            : null,
      repository: latestVersionData?.repository ?? data.repository ?? null,
      keywords: Array.isArray(latestVersionData?.keywords)
        ? (latestVersionData.keywords as string[])
        : Array.isArray(data.keywords)
          ? (data.keywords as string[])
          : [],
      license: latestVersionData?.license ?? data.license ?? null,
      author: latestVersionData?.author ?? data.author ?? null,
      maintainers: Array.isArray(data.maintainers) ? (data.maintainers as unknown[]) : [],
      time: isRecord(data.time) ? (data.time as Record<string, unknown>) : {},
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
