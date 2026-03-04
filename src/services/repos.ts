import { cache } from "@/cache";
import { CACHE_TTLS } from "@/env";
import { getErrorMessage, isRecord } from "@/utils/errors";
import { log } from "@/utils/logger";
import { getNetlify, getRender, getVercel } from "@/services/deployments";
import {
  fetchDeployments,
  fetchFileContent,
  fetchGitHubAPI,
  fetchReadme,
  fetchRepositoryLanguages,
} from "@/services/github";
import { getNpmPackage } from "@/services/npm";

export type GitHubRepo = {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  topics: string[];
  license: {
    name: string;
    spdx_id: string;
    url: string;
  } | null;
  has_pages: boolean;
  owner: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
  private: boolean;
  archived: boolean;
  fork: boolean;
  default_branch: string;
  size: number;
  disabled: boolean;
  deployments_url: string;
  releases_url: string;
  issues_url: string;
  pulls_url: string;
};

type EnhancedRepoOptions = {
  includeReadme?: boolean;
  includeLanguages?: boolean;
  includeDeployments?: boolean;
  includeNpm?: boolean;
  includeDeploymentLinks?: boolean;
};

type DeploymentLinks = {
  netlify: Record<string, unknown> | null;
  vercel: Record<string, unknown> | null;
  render: Record<string, unknown> | null;
};

export const DEFAULT_SEARCH_INCLUDE = [
  "readme",
  "languages",
  "deployments",
  "npm",
  "deployment-links",
] as const;

export const parseCommaSeparatedList = (str: string | undefined): string[] => {
  if (!str || typeof str !== "string") return [];
  return str
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
};

export const selectFields = <T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): Partial<T> => {
  if (!fields || fields.length === 0) return obj;
  const result: Partial<T> = {};

  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field as keyof T];
    }
  }

  return result;
};

export const sortRepos = <
  T extends { name?: string; stars?: number; updated_at?: string }
>(
  repos: T[],
  sortBy: string
): T[] => {
  const sorted = [...repos];

  switch (sortBy) {
    case "stars":
      return sorted.sort((left, right) => (right.stars ?? 0) - (left.stars ?? 0));
    case "name":
      return sorted.sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""));
    default:
      return sorted.sort(
        (left, right) =>
          new Date(right.updated_at ?? 0).getTime() -
          new Date(left.updated_at ?? 0).getTime()
      );
  }
};

export const paginate = <T>(
  data: T[],
  limit: number,
  offset: number
): {
  data: T[];
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
} => {
  const total = data.length;
  const safeLimit = Math.max(1, limit || 100);
  const safeOffset = Math.max(0, offset || 0);

  return {
    data: data.slice(safeOffset, safeOffset + safeLimit),
    meta: {
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < total,
    },
  };
};

export const formatBasicRepo = (repo: GitHubRepo): Record<string, unknown> => {
  const owner = repo.owner?.login ?? repo.full_name.split("/")[0];

  return {
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    html_url: repo.html_url,
    homepage: repo.homepage,
    language: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    watchers: repo.watchers_count,
    open_issues: repo.open_issues_count,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    pushed_at: repo.pushed_at,
    topics: repo.topics || [],
    license: repo.license
      ? {
          name: repo.license.name,
          spdx_id: repo.license.spdx_id,
          url: repo.license.url,
        }
      : null,
    has_pages: repo.has_pages,
    pages_url: repo.has_pages ? `https://${owner}.github.io/${repo.name}` : null,
    owner: {
      login: repo.owner.login,
      avatar_url: repo.owner.avatar_url,
      html_url: repo.owner.html_url,
    },
    private: repo.private,
    archived: repo.archived,
    fork: repo.fork,
  };
};

export const convertIncludeListToOptions = (
  includeList: string[]
): EnhancedRepoOptions => {
  return {
    includeReadme: includeList.includes("readme"),
    includeLanguages: includeList.includes("languages"),
    includeDeployments: includeList.includes("deployments"),
    includeNpm: includeList.includes("npm"),
    includeDeploymentLinks: includeList.includes("deployment-links"),
  };
};

export const matchesRepoQuery = (
  repo: {
    name?: unknown;
    full_name?: unknown;
    description?: unknown;
    topics?: unknown;
  },
  query: string
): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const topics = Array.isArray(repo.topics)
    ? repo.topics.map((topic) => String(topic)).join(" ")
    : "";

  const haystack = [
    typeof repo.name === "string" ? repo.name : "",
    typeof repo.full_name === "string" ? repo.full_name : "",
    typeof repo.description === "string" ? repo.description : "",
    topics,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
};

export const filterReposByQuery = async <
  T extends {
    name?: string;
    full_name?: string;
    description?: string | null;
    topics?: unknown;
    owner?: { login?: string };
  }
>(
  repos: T[],
  query: string
): Promise<T[]> => {
  const needle = query.trim().toLowerCase();
  if (!needle) return repos;

  const directMatches = new Set<string>();
  const readmeCandidates: T[] = [];

  for (const repo of repos) {
    const key = repo.full_name ?? `${repo.owner?.login ?? ""}/${repo.name ?? ""}`;
    if (matchesRepoQuery(repo, needle)) {
      directMatches.add(key);
    } else {
      readmeCandidates.push(repo);
    }
  }

  const readmeResults = await Promise.all(
    readmeCandidates.map(async (repo) => {
      const owner = repo.owner?.login;
      const name = repo.name;
      if (!owner || !name) return null;

      const readme = await fetchReadme(name, owner);
      if (!readme || !readme.toLowerCase().includes(needle)) {
        return null;
      }

      return repo.full_name ?? `${owner}/${name}`;
    })
  );

  for (const key of readmeResults) {
    if (key) {
      directMatches.add(key);
    }
  }

  return repos.filter((repo) => {
    const key = repo.full_name ?? `${repo.owner?.login ?? ""}/${repo.name ?? ""}`;
    return directMatches.has(key);
  });
};

const parseRepoUrl = (repoUrl: string): { owner: string; name: string } | null => {
  if (!repoUrl || typeof repoUrl !== "string") {
    return null;
  }

  let match = repoUrl.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/
  );
  if (match) {
    return { owner: match[1], name: match[2] };
  }

  match = repoUrl.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?/);
  if (match) {
    return { owner: match[1], name: match[2] };
  }

  match = repoUrl.match(/^([^/]+)\/([^/]+)$/);
  if (match) {
    return { owner: match[1], name: match[2] };
  }

  return null;
};

export const fetchNpmPackageInfo = async (
  repoName: string,
  owner: string
): Promise<Record<string, unknown> | null> => {
  try {
    const packageJsonContent = await fetchFileContent(repoName, "package.json", owner, false);

    if (!packageJsonContent || typeof packageJsonContent !== "string") {
      return null;
    }

    let packageJson: { name?: string; version?: string; repository?: unknown };

    try {
      packageJson = JSON.parse(packageJsonContent) as {
        name?: string;
        version?: string;
        repository?: unknown;
      };
    } catch {
      return null;
    }

    if (!packageJson.name) {
      return null;
    }

    const npmPackageInfo = await getNpmPackage(packageJson.name, false);

    return {
      package_name: packageJson.name,
      version: packageJson.version ?? null,
      npm_link: `https://www.npmjs.com/package/${packageJson.name}`,
      repository: packageJson.repository ?? null,
      npmjs: npmPackageInfo
        ? {
            ...npmPackageInfo,
            exists: true,
          }
        : {
            exists: false,
          },
    };
  } catch (error) {
    log("error", "Error in fetchNpmPackageInfo", {
      repoName,
      owner,
      error: getErrorMessage(error),
    });
    return null;
  }
};

export const fetchDeploymentLinks = async (
  repoName: string,
  owner: string
): Promise<DeploymentLinks | null> => {
  try {
    const cacheKey = "deployment-platforms";

    let platformsData = await cache.get<{
      netlify: Record<string, unknown>[];
      vercel: Record<string, unknown>[];
      render: Record<string, unknown>[];
    }>(cacheKey);

    if (!platformsData) {
      const [netlifyResult, vercelResult, renderResult] = await Promise.all([
        getNetlify(),
        getVercel(),
        getRender(),
      ]);

      platformsData = {
        netlify:
          netlifyResult.configured && Array.isArray(netlifyResult.data)
            ? (netlifyResult.data as Record<string, unknown>[])
            : [],
        vercel:
          vercelResult.configured && Array.isArray(vercelResult.data)
            ? (vercelResult.data as Record<string, unknown>[])
            : [],
        render:
          renderResult.configured && Array.isArray(renderResult.data)
            ? (renderResult.data as Record<string, unknown>[])
            : [],
      };

      await cache.set(cacheKey, platformsData, CACHE_TTLS.medium);
    }

    const deploymentLinks: DeploymentLinks = {
      netlify: null,
      vercel: null,
      render: null,
    };

    for (const site of platformsData.netlify) {
      const repo = site.repo;
      if (typeof repo !== "string") continue;

      const parsed = parseRepoUrl(repo);
      if (parsed && parsed.owner === owner && parsed.name === repoName) {
        deploymentLinks.netlify = {
          name: site.name ?? null,
          url: site.ssl_url ?? site.url ?? null,
          repo,
        };
        break;
      }
    }

    for (const site of platformsData.vercel) {
      const repo = site.repo;
      if (typeof repo !== "string") continue;

      const parsed = parseRepoUrl(repo);
      if (parsed && parsed.owner === owner && parsed.name === repoName) {
        deploymentLinks.vercel = {
          name: site.name ?? null,
          url: site.url ?? null,
          repo,
          framework: site.framework ?? null,
        };
        break;
      }
    }

    for (const site of platformsData.render) {
      const repo = site.repo;
      if (typeof repo !== "string") continue;

      const parsed = parseRepoUrl(repo);
      if (parsed && parsed.owner === owner && parsed.name === repoName) {
        deploymentLinks.render = {
          name: site.name ?? null,
          url: site.url ?? null,
          repo,
        };
        break;
      }
    }

    return deploymentLinks.netlify || deploymentLinks.vercel || deploymentLinks.render
      ? deploymentLinks
      : null;
  } catch (error) {
    log("error", "Error in fetchDeploymentLinks", {
      repoName,
      owner,
      error: getErrorMessage(error),
    });
    return null;
  }
};

const deploymentLinksToArray = (links: DeploymentLinks): Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = [];

  if (links.netlify) {
    result.push({ platform: "netlify", source: "external", ...links.netlify });
  }

  if (links.vercel) {
    result.push({ platform: "vercel", source: "external", ...links.vercel });
  }

  if (links.render) {
    result.push({ platform: "render", source: "external", ...links.render });
  }

  return result;
};

export const fetchRepositoryDeploymentsWithFallback = async (
  repoName: string,
  owner: string
): Promise<Record<string, unknown>[]> => {
  const githubDeployments = await fetchDeployments(repoName, owner);

  if (Array.isArray(githubDeployments) && githubDeployments.length > 0) {
    return githubDeployments.map((deployment) => ({
      ...(isRecord(deployment) ? deployment : { value: deployment }),
      source: "github",
    }));
  }

  const deploymentLinks = await fetchDeploymentLinks(repoName, owner);
  if (!deploymentLinks) {
    return [];
  }

  return deploymentLinksToArray(deploymentLinks);
};

export const fetchEnhancedRepositoryData = async (
  repoName: string,
  owner: string,
  options: EnhancedRepoOptions = {}
): Promise<Record<string, unknown> | null> => {
  const {
    includeReadme = true,
    includeLanguages = true,
    includeDeployments = true,
    includeNpm = true,
    includeDeploymentLinks = true,
  } = options;

  const repoData = (await fetchGitHubAPI(`/repos/${owner}/${repoName}`)) as
    | GitHubRepo
    | { message?: string }
    | null;

  if (!repoData || (isRecord(repoData) && "message" in repoData)) {
    return null;
  }

  const repo = repoData as GitHubRepo;

  const enhancedData: Record<string, unknown> = {
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    html_url: repo.html_url,
    homepage: repo.homepage,
    language: repo.language,
    default_branch: repo.default_branch,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    watchers: repo.watchers_count,
    open_issues: repo.open_issues_count,
    size: repo.size,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    pushed_at: repo.pushed_at,
    topics: repo.topics || [],
    license: repo.license
      ? {
          key: repo.license.spdx_id,
          name: repo.license.name,
          spdx_id: repo.license.spdx_id,
          url: repo.license.url,
        }
      : null,
    archived: repo.archived,
    disabled: repo.disabled,
    private: repo.private,
    fork: repo.fork,
    has_pages: repo.has_pages,
    pages_url: repo.has_pages ? `https://${owner}.github.io/${repoName}` : null,
    owner: {
      login: repo.owner.login,
      avatar_url: repo.owner.avatar_url,
      html_url: repo.owner.html_url,
    },
    deployments_url: repo.deployments_url,
    releases_url: repo.releases_url,
    issues_url: repo.issues_url,
    pulls_url: repo.pulls_url,
  };

  const additionalDataPromises: Promise<Record<string, unknown>>[] = [];

  if (includeReadme) {
    additionalDataPromises.push(fetchReadme(repoName, owner).then((readme) => ({ readme })));
  }

  if (includeLanguages) {
    additionalDataPromises.push(
      fetchRepositoryLanguages(repoName, owner).then((languages) => ({
        languages,
      }))
    );
  }

  if (includeDeployments) {
    additionalDataPromises.push(
      fetchRepositoryDeploymentsWithFallback(repoName, owner).then((deployments) => ({
        deployments,
      }))
    );
  }

  if (includeNpm) {
    additionalDataPromises.push(fetchNpmPackageInfo(repoName, owner).then((npm) => ({ npm })));
  }

  if (includeDeploymentLinks) {
    additionalDataPromises.push(
      fetchDeploymentLinks(repoName, owner).then((deploymentLinks) => ({
        deployment_links: deploymentLinks,
      }))
    );
  }

  const additionalData = await Promise.all(additionalDataPromises);
  for (const payload of additionalData) {
    Object.assign(enhancedData, payload);
  }

  return enhancedData;
};
