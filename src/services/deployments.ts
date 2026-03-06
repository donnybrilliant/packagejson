import { env } from "@/env";
import { getErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";
import type { JsonObject, JsonValue } from "@/types/json";

export type DeploymentItem = JsonObject;

export type FetchResult =
  | {
      configured: false;
      message: string;
    }
  | {
      configured: true;
      message?: string;
      error?: string;
      data: DeploymentItem[];
    };

type FetcherConfig = {
  platformName: "Netlify" | "Vercel" | "Render";
  token?: string;
  apiUrl: string;
  transform: (input: JsonValue) => DeploymentItem[];
};

const fetchPlatformDeployments = async ({
  platformName,
  token,
  apiUrl,
  transform,
}: FetcherConfig): Promise<FetchResult> => {
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
        data: [],
      };
    }

    const raw = (await res.json()) as JsonValue;
    return {
      configured: true,
      data: transform(raw),
    };
  } catch (error) {
    log("error", `Error fetching ${platformName} deployments`, {
      platformName,
      error: getErrorMessage(error),
    });

    return {
      configured: true,
      message: `Error fetching ${platformName} deployments: ${getErrorMessage(error)}`,
      data: [],
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
};

type VercelProject = {
  name?: string;
  link?: { type?: string; org?: string; repo?: string } | null;
  framework?: string | null;
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
};

const transformNetlify = (data: JsonValue): DeploymentItem[] => {
  if (!Array.isArray(data)) return [];

  return (data as NetlifySite[]).map((site) => ({
    name: site.name ?? null,
    url: site.url ?? null,
    ssl_url: site.ssl_url ?? null,
    img: site.screenshot_url ?? null,
    repo: site.build_settings?.repo_url ?? site.build_settings?.repo ?? site.repo_url ?? null,
    platform: "netlify",
  }));
};

const transformVercel = (data: JsonValue): DeploymentItem[] => {
  const projects = (data as { projects?: VercelProject[] } | null)?.projects;
  if (!Array.isArray(projects)) return [];

  return projects.map((project) => {
    let url: string | null = null;
    if (project.latestDeployments?.[0]?.alias?.[0]) {
      url = `https://${project.latestDeployments[0].alias[0]}`;
    }

    let repo: string | null = null;
    if (project.link?.type && project.link?.org && project.link?.repo) {
      repo = `https://${project.link.type}.com/${project.link.org}/${project.link.repo}`;
    }

    return {
      name: project.name ?? null,
      url,
      repo,
      framework: project.framework ?? null,
      platform: "vercel",
    };
  });
};

const transformRender = (data: JsonValue): DeploymentItem[] => {
  if (!Array.isArray(data)) return [];

  return (data as RenderService[]).map((service) => ({
    name: service.service?.name ?? service.name ?? null,
    url: service.service?.serviceDetails?.url ?? null,
    repo: service.service?.repo ?? null,
    type: service.type ?? null,
    platform: "render",
  }));
};

const getTestFixtures = (): {
  netlify: DeploymentItem[];
  vercel: DeploymentItem[];
  render: DeploymentItem[];
} => ({
  netlify: [],
  vercel: [
    {
      name: "readme-only-repo",
      url: "https://readme-only-repo.vercel.app",
      repo: "https://github.com/test-owner/readme-only-repo",
      framework: "nextjs",
      platform: "vercel",
    },
  ],
  render: [],
});

export const getNetlify = async (): Promise<FetchResult> => {
  if (env.NODE_ENV === "test") {
    return { configured: true, data: getTestFixtures().netlify };
  }

  return fetchPlatformDeployments({
    platformName: "Netlify",
    token: env.NETLIFY_TOKEN,
    apiUrl: `${env.NETLIFY_API_URL}/sites`,
    transform: transformNetlify,
  });
};

export const getVercel = async (): Promise<FetchResult> => {
  if (env.NODE_ENV === "test") {
    return { configured: true, data: getTestFixtures().vercel };
  }

  return fetchPlatformDeployments({
    platformName: "Vercel",
    token: env.VERCEL_TOKEN,
    apiUrl: `${env.VERCEL_API_URL}/v9/projects`,
    transform: transformVercel,
  });
};

export const getRender = async (): Promise<FetchResult> => {
  if (env.NODE_ENV === "test") {
    return { configured: true, data: getTestFixtures().render };
  }

  return fetchPlatformDeployments({
    platformName: "Render",
    token: env.RENDER_TOKEN,
    apiUrl: `${env.RENDER_API_URL}/services`,
    transform: transformRender,
  });
};
