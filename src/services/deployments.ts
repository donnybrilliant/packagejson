import { env } from "@/env";
import { getErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";

/**
 * Deployment item from external platforms
 */
type DeploymentItem = Record<string, unknown>;

/**
 * Result of fetching deployments from external platforms
 */
type FetchResult =
  | {
      configured: false;
      message: string;
    }
  | {
      configured: true;
      message?: string;
      error?: string;
      data?: DeploymentItem[];
    };

/**
 * Configuration for fetching deployments from a platform
 */
type FetcherConfig = {
  platformName: "Netlify" | "Vercel" | "Render";
  token?: string;
  apiUrl: string;
  transform: (input: unknown) => DeploymentItem[];
};

/**
 * Generic function to fetch deployments from external platforms
 * Handles authentication, error handling, and data transformation
 * @param config - Configuration object with platform details
 * @returns Promise that resolves to fetch result
 */
const fetchDeployments = async ({
  platformName,
  token,
  apiUrl,
  transform,
}: FetcherConfig): Promise<FetchResult> => {
  if (env.NODE_ENV === "test") {
    return { configured: false, message: "test stub" };
  }

  if (!token) {
    return {
      configured: false,
      message: `${platformName} API token is not configured.`,
    };
  }

  try {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        configured: true,
        message: `${platformName} API error: ${res.status} ${res.statusText}`,
        error: errorText,
      };
    }

    const raw = (await res.json()) as unknown;
    const data = transform(raw);
    return { configured: true, data };
  } catch (error) {
    log("error", `Error fetching ${platformName} sites`, {
      platformName,
      error: getErrorMessage(error),
    });
    return {
      configured: true,
      message: `Error fetching ${platformName} sites: ${getErrorMessage(error)}`,
    };
  }
};

type NetlifySite = {
  name?: string;
  url?: string;
  ssl_url?: string;
  screenshot_url?: string;
  build_settings?: {
    repo_url?: string;
    repo?: string;
  };
  repo_url?: string;
  versions?: { node?: { active?: string | null; default?: string } | string };
};

type VercelProject = {
  name?: string;
  link?: { type?: string; org?: string; repo?: string; url?: string } | null;
  framework?: string | null;
  createdAt?: number;
  latestDeployments?: Array<{ alias?: string[] }>;
};

type RenderService = {
  name?: string;
  service?: {
    name?: string;
    serviceDetails?: { url?: string };
    repo?: string;
  };
  type?: string | null;
  suspenders?: unknown;
  slug?: string | null;
};

/**
 * Transforms Netlify API response to standardized deployment items
 * Extracts repo URL from multiple possible locations in the response
 * @param data - Raw data from Netlify API
 * @returns Array of transformed deployment items
 */
const transformNetlify = (data: unknown): DeploymentItem[] => {
  if (!Array.isArray(data)) return [];
  return (data as NetlifySite[]).map((site) => {
    const nodeVersion = site?.versions?.node;
    const nodeObj =
      typeof nodeVersion === "object" && nodeVersion !== null
        ? {
            active: nodeVersion.active ?? null,
            default: nodeVersion.default ?? "22",
          }
        : nodeVersion
          ? { active: null, default: String(nodeVersion) }
          : null;

    // Extract repo URL from multiple possible locations
    const repoUrl =
      site?.build_settings?.repo_url ?? site?.build_settings?.repo ?? site?.repo_url ?? null;

    return {
      name: site?.name ?? null,
      url: site?.url ?? null,
      ssl_url: site?.ssl_url ?? null,
      img: site?.screenshot_url ?? null,
      repo: repoUrl,
      node: nodeObj,
    };
  });
};

/**
 * Transforms Vercel API response to standardized deployment items
 * Extracts URL from latest deployment and constructs repo URL from link properties
 * @param data - Raw data from Vercel API
 * @returns Array of transformed deployment items
 */
const transformVercel = (data: unknown): DeploymentItem[] => {
  const projects = (data as { projects?: VercelProject[] })?.projects;
  if (!Array.isArray(projects)) return [];
  return projects.map((p) => {
    // Extract URL from latest deployment alias (v1 pattern)
    let url: string | null = null;
    if (p?.latestDeployments?.[0]?.alias?.[0]) {
      url = `https://${p.latestDeployments[0].alias[0]}`;
    }

    // Construct repo URL from link properties (v1 pattern)
    let repo: string | null = null;
    if (p?.link?.type && p?.link?.org && p?.link?.repo) {
      repo = `https://${p.link.type}.com/${p.link.org}/${p.link.repo}`;
    }

    return {
      name: p?.name ?? null,
      url,
      repo: repo,
      framework: p?.framework ?? null,
      createdAt: p?.createdAt ?? null,
    };
  });
};

/**
 * Transforms Render API response to standardized deployment items
 * @param data - Raw data from Render API
 * @returns Array of transformed deployment items
 */
const transformRender = (data: unknown): DeploymentItem[] => {
  if (!Array.isArray(data)) return [];
  return (data as RenderService[]).map((service) => ({
    name: service.service?.name ?? service.name ?? "Unknown",
    url: service.service?.serviceDetails?.url ?? null,
    repo: service.service?.repo ?? null,
    type: service.type ?? null,
    suspenders: service.suspenders ?? null,
    slug: service.slug ?? null,
  }));
};

/**
 * Fetches all Netlify sites
 * @param options - Query options for filtering and pagination
 * @returns Promise that resolves to Netlify sites or configuration status
 */
export const getNetlifySites = (options?: {
  filter?: string;
  sort?: string;
  page?: number;
  per_page?: number;
}) => {
  const params = new URLSearchParams();
  if (options?.filter) params.append("filter", options.filter);
  if (options?.sort) params.append("sort", options.sort);
  if (options?.page) params.append("page", String(options.page));
  if (options?.per_page) params.append("per_page", String(options.per_page));

  const queryString = params.toString();
  const apiUrl = `${env.NETLIFY_API_URL}/sites${queryString ? `?${queryString}` : ""}`;

  return fetchDeployments({
    platformName: "Netlify",
    token: env.NETLIFY_TOKEN,
    apiUrl,
    transform: transformNetlify,
  });
};

/**
 * Fetches a specific Netlify site by ID
 * @param siteId - Site ID
 * @returns Promise that resolves to site details or null
 */
export const getNetlifySite = async (
  siteId: string
): Promise<DeploymentItem | null> => {
  if (env.NODE_ENV === "test") {
    return null;
  }

  if (!env.NETLIFY_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(`${env.NETLIFY_API_URL}/sites/${siteId}`, {
      headers: { Authorization: `Bearer ${env.NETLIFY_TOKEN}` },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as NetlifySite;
    return transformNetlify([data])[0] ?? null;
  } catch (error) {
    log("error", "Error fetching Netlify site", {
      siteId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches deployments for a specific Netlify site
 * @param siteId - Site ID
 * @param options - Query options
 * @returns Promise that resolves to deployments array or null
 */
export const getNetlifySiteDeploys = async (
  siteId: string,
  options?: { page?: number; per_page?: number }
): Promise<unknown[] | null> => {
  if (env.NODE_ENV === "test") {
    return [];
  }

  if (!env.NETLIFY_TOKEN) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    if (options?.page) params.append("page", String(options.page));
    if (options?.per_page) params.append("per_page", String(options.per_page));

    const queryString = params.toString();
    const response = await fetch(
      `${env.NETLIFY_API_URL}/sites/${siteId}/deploys${queryString ? `?${queryString}` : ""}`,
      {
        headers: { Authorization: `Bearer ${env.NETLIFY_TOKEN}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as unknown[];
    return Array.isArray(data) ? data : null;
  } catch (error) {
    log("error", "Error fetching Netlify deploys", {
      siteId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * @deprecated Use getNetlifySites instead
 * Fetches deployments from Netlify
 * @returns Promise that resolves to Netlify deployments or configuration status
 */
export const getNetlify = () => getNetlifySites();

/**
 * Fetches all Vercel projects
 * @param options - Query options for filtering and pagination
 * @returns Promise that resolves to Vercel projects or configuration status
 */
export const getVercelProjects = (options?: {
  filter?: string;
  limit?: number;
  since?: number;
  until?: number;
  teamId?: string;
}) => {
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.since) params.append("since", String(options.since));
  if (options?.until) params.append("until", String(options.until));
  if (options?.teamId) params.append("teamId", options.teamId);

  const queryString = params.toString();
  const apiUrl = `${env.VERCEL_API_URL}/v9/projects${queryString ? `?${queryString}` : ""}`;

  return fetchDeployments({
    platformName: "Vercel",
    token: env.VERCEL_TOKEN,
    apiUrl,
    transform: transformVercel,
  });
};

/**
 * Fetches a specific Vercel project by ID
 * @param projectId - Project ID
 * @param teamId - Optional team ID
 * @returns Promise that resolves to project details or null
 */
export const getVercelProject = async (
  projectId: string,
  teamId?: string
): Promise<DeploymentItem | null> => {
  if (env.NODE_ENV === "test") {
    return null;
  }

  if (!env.VERCEL_TOKEN) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    if (teamId) params.append("teamId", teamId);

    const queryString = params.toString();
    const response = await fetch(
      `${env.VERCEL_API_URL}/v9/projects/${projectId}${queryString ? `?${queryString}` : ""}`,
      {
        headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { project?: VercelProject };
    if (data.project) {
      return transformVercel({ projects: [data.project] })[0] ?? null;
    }
    return null;
  } catch (error) {
    log("error", "Error fetching Vercel project", {
      projectId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches deployments for a specific Vercel project
 * @param projectId - Project ID
 * @param options - Query options
 * @returns Promise that resolves to deployments array or null
 */
export const getVercelProjectDeployments = async (
  projectId: string,
  options?: {
    limit?: number;
    since?: number;
    until?: number;
    teamId?: string;
    target?: string;
  }
): Promise<unknown[] | null> => {
  if (env.NODE_ENV === "test") {
    return [];
  }

  if (!env.VERCEL_TOKEN) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.since) params.append("since", String(options.since));
    if (options?.until) params.append("until", String(options.until));
    if (options?.teamId) params.append("teamId", options.teamId);
    if (options?.target) params.append("target", options.target);

    const queryString = params.toString();
    const response = await fetch(
      `${env.VERCEL_API_URL}/v9/projects/${projectId}/deployments${queryString ? `?${queryString}` : ""}`,
      {
        headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { deployments?: unknown[] };
    return Array.isArray(data.deployments) ? data.deployments : null;
  } catch (error) {
    log("error", "Error fetching Vercel deployments", {
      projectId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * @deprecated Use getVercelProjects instead
 * Fetches deployments from Vercel
 * @returns Promise that resolves to Vercel deployments or configuration status
 */
export const getVercel = () => getVercelProjects();

/**
 * Fetches all Render services
 * @param options - Query options for filtering
 * @returns Promise that resolves to Render services or configuration status
 */
export const getRenderServices = (options?: {
  limit?: number;
  name?: string;
}) => {
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.name) params.append("name", options.name);

  const queryString = params.toString();
  const apiUrl = `${env.RENDER_API_URL}/services${queryString ? `?${queryString}` : ""}`;

  return fetchDeployments({
    platformName: "Render",
    token: env.RENDER_TOKEN,
    apiUrl,
    transform: transformRender,
  });
};

/**
 * Fetches a specific Render service by ID
 * @param serviceId - Service ID
 * @returns Promise that resolves to service details or null
 */
export const getRenderService = async (
  serviceId: string
): Promise<DeploymentItem | null> => {
  if (env.NODE_ENV === "test") {
    return null;
  }

  if (!env.RENDER_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(
      `${env.RENDER_API_URL}/services/${serviceId}`,
      {
        headers: { Authorization: `Bearer ${env.RENDER_TOKEN}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as RenderService;
    return transformRender([data])[0] ?? null;
  } catch (error) {
    log("error", "Error fetching Render service", {
      serviceId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches deploys for a specific Render service
 * @param serviceId - Service ID
 * @param options - Query options
 * @returns Promise that resolves to deploys array or null
 */
export const getRenderServiceDeploys = async (
  serviceId: string,
  options?: { limit?: number }
): Promise<unknown[] | null> => {
  if (env.NODE_ENV === "test") {
    return [];
  }

  if (!env.RENDER_TOKEN) {
    return null;
  }

  try {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", String(options.limit));

    const queryString = params.toString();
    const response = await fetch(
      `${env.RENDER_API_URL}/services/${serviceId}/deploys${queryString ? `?${queryString}` : ""}`,
      {
        headers: { Authorization: `Bearer ${env.RENDER_TOKEN}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as unknown[];
    return Array.isArray(data) ? data : null;
  } catch (error) {
    log("error", "Error fetching Render deploys", {
      serviceId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * @deprecated Use getRenderServices instead
 * Fetches deployments from Render
 * @returns Promise that resolves to Render deployments or configuration status
 */
export const getRender = () => getRenderServices();
