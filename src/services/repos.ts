import { cache } from "@/cache";
import { CACHE_TTLS } from "@/env";
import { getErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";

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

import { getNetlify, getRender, getVercel } from "@/services/deployments";
import {
  fetchCICDStatus,
  fetchCodeFrequency,
  fetchCommitActivity,
  fetchContributorStats,
  fetchDeployments,
  fetchFileContent,
  fetchGitHubAPI,
  fetchParticipation,
  fetchReadme,
  fetchReleases,
  fetchRepositoryLanguages,
  fetchWorkflowRuns,
  fetchWorkflows,
} from "@/services/github";
import { getNpmPackage } from "@/services/npm";

/**
 * Options for fetching enhanced repository data
 */
type EnhancedRepoOptions = {
  includeReadme?: boolean;
  includeLanguages?: boolean;
  includeStats?: boolean;
  includeReleases?: boolean;
  includeWorkflows?: boolean;
  includeCICD?: boolean;
  includeDeployments?: boolean;
  includeNpm?: boolean;
  includeDeploymentLinks?: boolean;
};

// Helper functions

/**
 * Parses a comma-separated string into an array of trimmed strings
 * @param str - Comma-separated string (e.g., "readme,languages,stats")
 * @returns Array of trimmed, non-empty strings
 */
export const parseCommaSeparatedList = (str: string | undefined): string[] => {
  if (!str || typeof str !== "string") return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * Selects specific fields from an object
 * @param obj - Source object
 * @param fields - Array of field names to select
 * @returns Object with only selected fields, or original object if fields array is empty
 */
export const selectFields = <T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): Partial<T> => {
  if (!fields || fields.length === 0) return obj;
  const result: Partial<T> = {};
  for (const field of fields) {
    if (field in obj) {
      result[field as keyof T] = obj[field] as T[keyof T];
    }
  }
  return result;
};

/**
 * Sorts repositories by specified field
 * @param repos - Array of repositories to sort
 * @param sortBy - Sort field: "stars", "name", or "updated" (default)
 * @returns New sorted array
 */
export const sortRepos = <
  T extends { name?: string; stars?: number; updated_at?: string }
>(
  repos: T[],
  sortBy: string
): T[] => {
  const sorted = [...repos];
  switch (sortBy) {
    case "stars":
      return sorted.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
    case "name":
      return sorted.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    default:
      return sorted.sort(
        (a, b) =>
          new Date(b.updated_at ?? 0).getTime() -
          new Date(a.updated_at ?? 0).getTime()
      );
  }
};

/**
 * Paginates an array with metadata
 * @param array - Array to paginate
 * @param limit - Number of items per page (minimum 1)
 * @param offset - Starting offset (minimum 0)
 * @returns Object with paginated data and metadata
 */
export const paginate = <T>(
  array: T[],
  limit: number,
  offset: number
): {
  data: T[];
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
} => {
  const total = array.length;
  const limitNum = Math.max(1, limit || 100);
  const offsetNum = Math.max(0, offset || 0);
  const data = array.slice(offsetNum, offsetNum + limitNum);

  return {
    data,
    meta: {
      total,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + limitNum < total,
    },
  };
};

/**
 * Formats basic repository data from GitHub API response
 * Transforms GitHub API format to our standard format
 * @param repo - Repository object from GitHub API
 * @returns Formatted repository object
 */
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
    pages_url: repo.has_pages
      ? `https://${owner}.github.io/${repo.name}`
      : null,
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

/**
 * Converts include list to options object for fetchEnhancedRepositoryData
 * @param includeList - Array of field names to include
 * @returns Options object with boolean flags for each field
 */
export const convertIncludeListToOptions = (
  includeList: string[]
): EnhancedRepoOptions => {
  return {
    includeReadme: includeList.includes("readme"),
    includeLanguages: includeList.includes("languages"),
    includeStats: includeList.includes("stats"),
    includeReleases: includeList.includes("releases"),
    includeWorkflows: includeList.includes("workflows"),
    includeCICD: includeList.includes("cicd"),
    includeDeployments: includeList.includes("deployments"),
    includeNpm: includeList.includes("npm"),
    includeDeploymentLinks: includeList.includes("deployment-links"),
  };
};

/**
 * Parses repository URL in various formats to extract owner and name
 * Supports: https://github.com/owner/repo, git@github.com:owner/repo.git, owner/repo
 * @param repoUrl - Repository URL in various formats
 * @returns Object with owner and name, or null if not parseable
 */
const parseRepoUrl = (
  repoUrl: string
): { owner: string; name: string } | null => {
  if (!repoUrl || typeof repoUrl !== "string") {
    return null;
  }

  // Handle different URL formats
  let match = repoUrl.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/
  );
  if (match) {
    return { owner: match[1], name: match[2] };
  }

  // Try git@ format
  match = repoUrl.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?/);
  if (match) {
    return { owner: match[1], name: match[2] };
  }

  // Try owner/repo format
  match = repoUrl.match(/^([^/]+)\/([^/]+)$/);
  if (match) {
    return { owner: match[1], name: match[2] };
  }

  return null;
};

/**
 * Fetches NPM package information for a repository
 * Extracts package name from package.json and checks npmjs registry
 * Also detects GitHub Actions workflows that publish to npm
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to NPM package info or null
 */
export const fetchNpmPackageInfo = async (
  repoName: string,
  owner: string
): Promise<unknown | null> => {
  try {
    log("debug", "Fetching NPM package info", { repoName, owner });
    const packageJsonContent = await fetchFileContent(
      repoName,
      "package.json",
      owner,
      false
    );

    if (!packageJsonContent || typeof packageJsonContent !== "string") {
      return null;
    }

    let packageJson: { name?: string; version?: string; repository?: unknown };
    try {
      packageJson = JSON.parse(packageJsonContent);
    } catch {
      return null;
    }

    if (!packageJson.name) {
      return null;
    }

    const packageName = packageJson.name;

    // Check for GitHub Actions workflows that might publish to npm
    const workflows = await fetchWorkflows(repoName, owner);
    let hasNpmPublishWorkflow = false;
    let npmPublishWorkflow: unknown = null;

    if (workflows && Array.isArray(workflows)) {
      for (const workflow of workflows) {
        const wf = workflow as {
          path?: string;
          id?: number;
          name?: string;
          state?: string;
          html_url?: string;
        };
        const workflowPath = wf.path;
        if (workflowPath?.includes(".github/workflows")) {
          const workflowContent = await fetchFileContent(
            repoName,
            workflowPath,
            owner,
            false
          );

          if (
            workflowContent &&
            typeof workflowContent === "string" &&
            (workflowContent.includes("npm publish") ||
              workflowContent.includes("publish-to-npm") ||
              workflowContent.includes("npmjs.com") ||
              workflowContent.includes("actions/setup-node") ||
              workflowContent.includes("publish"))
          ) {
            hasNpmPublishWorkflow = true;
            npmPublishWorkflow = {
              id: wf.id,
              name: wf.name,
              path: wf.path,
              state: wf.state,
              html_url: wf.html_url,
            };
            break;
          }
        }
      }
    }

    // Fetch package information from npmjs API
    const npmPackageInfo = await getNpmPackage(packageName, false);

    const result: Record<string, unknown> = {
      package_name: packageName,
      version: packageJson.version || null,
      npm_link: `https://www.npmjs.com/package/${packageName}`,
      has_npm_publish_workflow: hasNpmPublishWorkflow,
      npm_publish_workflow: npmPublishWorkflow,
      repository: packageJson.repository || null,
    };

    if (npmPackageInfo) {
      result.npmjs = {
        ...npmPackageInfo,
        exists: true,
      };
    } else {
      result.npmjs = {
        exists: false,
      };
    }

    return result;
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
): Promise<unknown | null> => {
  try {
    // Cache key for deployment platforms data
    const CACHE_KEY = "deploymentPlatforms";
    let platformsData = await cache.get<{
      netlify: unknown[];
      vercel: unknown[];
      render: unknown[];
    }>(CACHE_KEY);

    // Fetch all platforms if not cached
    if (!platformsData) {
      const [netlifyResult, vercelResult, renderResult] = await Promise.all([
        getNetlify(),
        getVercel(),
        getRender(),
      ]);

      const netlifySites =
        netlifyResult?.configured && netlifyResult.data
          ? netlifyResult.data
          : [];
      const vercelSites =
        vercelResult?.configured && vercelResult.data ? vercelResult.data : [];
      const renderSites =
        renderResult?.configured && renderResult.data ? renderResult.data : [];

      platformsData = {
        netlify: Array.isArray(netlifySites) ? netlifySites : [],
        vercel: Array.isArray(vercelSites) ? vercelSites : [],
        render: Array.isArray(renderSites) ? renderSites : [],
      };

      await cache.set(CACHE_KEY, platformsData, CACHE_TTLS.medium);
    }

    const deployments: {
      netlify: unknown;
      vercel: unknown;
      render: unknown;
    } = {
      netlify: null,
      vercel: null,
      render: null,
    };

    // Match Netlify deployments
    if (Array.isArray(platformsData.netlify)) {
      for (const site of platformsData.netlify) {
        const s = site as {
          repo?: string;
          name?: string;
          ssl_url?: string;
          url?: string;
        };
        if (s.repo) {
          const parsed = parseRepoUrl(s.repo);
          if (parsed && parsed.owner === owner && parsed.name === repoName) {
            deployments.netlify = {
              name: s.name,
              url: s.ssl_url || s.url,
              repo: s.repo,
            };
            break;
          }
        }
      }
    }

    // Match Vercel deployments
    if (Array.isArray(platformsData.vercel)) {
      for (const site of platformsData.vercel) {
        const s = site as {
          repo?: string;
          name?: string;
          url?: string;
          framework?: string;
        };
        if (s.repo) {
          const parsed = parseRepoUrl(s.repo);
          if (parsed && parsed.owner === owner && parsed.name === repoName) {
            deployments.vercel = {
              name: s.name,
              url: s.url,
              repo: s.repo,
              framework: s.framework,
            };
            break;
          }
        }
      }
    }

    // Match Render deployments
    if (Array.isArray(platformsData.render)) {
      for (const site of platformsData.render) {
        const s = site as { repo?: string; name?: string; url?: string };
        if (s.repo) {
          const parsed = parseRepoUrl(s.repo);
          if (parsed && parsed.owner === owner && parsed.name === repoName) {
            deployments.render = {
              name: s.name,
              url: s.url,
              repo: s.repo,
            };
            break;
          }
        }
      }
    }

    const hasDeployments =
      deployments.netlify || deployments.vercel || deployments.render;

    return hasDeployments ? deployments : null;
  } catch (error) {
    log("error", "Error in fetchDeploymentLinks", {
      repoName,
      owner,
      error: getErrorMessage(error),
    });
    return null;
  }
};

export const fetchEnhancedRepositoryData = async (
  repoName: string,
  owner: string,
  options: EnhancedRepoOptions = {}
): Promise<unknown | null> => {
  const {
    includeReadme = true,
    includeLanguages = true,
    includeStats = true,
    includeReleases = true,
    includeWorkflows = true,
    includeCICD = true,
    includeDeployments = true,
    includeNpm = true,
    includeDeploymentLinks = true,
  } = options;

  // Fetch base repository data
  const repoData = (await fetchGitHubAPI(`/repos/${owner}/${repoName}`)) as
    | GitHubRepo
    | { message?: string }
    | null;

  if (!repoData || (typeof repoData === "object" && "message" in repoData)) {
    return null;
  }

  const repo = repoData as GitHubRepo;

  // Build enhanced data object
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

  // Fetch additional data in parallel
  const additionalDataPromises: Promise<Record<string, unknown>>[] = [];

  if (includeReadme) {
    additionalDataPromises.push(
      fetchReadme(repoName, owner).then((readme) => ({ readme }))
    );
  }

  if (includeLanguages) {
    additionalDataPromises.push(
      fetchRepositoryLanguages(repoName, owner).then((languages) => ({
        languages,
      }))
    );
  }

  if (includeStats) {
    additionalDataPromises.push(
      Promise.all([
        fetchCommitActivity(repoName, owner),
        fetchContributorStats(repoName, owner),
        fetchCodeFrequency(repoName, owner),
        fetchParticipation(repoName, owner),
      ]).then(
        ([commitActivity, contributors, codeFrequency, participation]) => ({
          stats: {
            commit_activity: commitActivity,
            contributors: contributors,
            code_frequency: codeFrequency,
            participation: participation,
          },
        })
      )
    );
  }

  if (includeReleases) {
    additionalDataPromises.push(
      fetchReleases(repoName, owner).then((releases) => ({ releases }))
    );
  }

  if (includeWorkflows) {
    additionalDataPromises.push(
      Promise.all([
        fetchWorkflows(repoName, owner),
        fetchWorkflowRuns(repoName, owner),
      ]).then(([workflows, workflowRuns]) => ({
        workflows: workflows,
        workflow_runs: workflowRuns,
      }))
    );
  }

  if (includeCICD) {
    additionalDataPromises.push(
      fetchCICDStatus(repoName, owner).then((cicdStatus) => ({
        cicd_status: cicdStatus,
      }))
    );
  }

  if (includeDeployments) {
    additionalDataPromises.push(
      fetchDeployments(repoName, owner).then((deployments) => ({
        deployments: deployments,
      }))
    );
  }

  if (includeNpm) {
    additionalDataPromises.push(
      fetchNpmPackageInfo(repoName, owner).then((npmInfo) => ({
        npm: npmInfo,
      }))
    );
  }

  if (includeDeploymentLinks) {
    additionalDataPromises.push(
      fetchDeploymentLinks(repoName, owner).then((deploymentLinks) => ({
        deployment_links: deploymentLinks,
      }))
    );
  }

  // Wait for all additional data
  const additionalData = await Promise.all(additionalDataPromises);

  // Merge additional data into enhanced data
  for (const data of additionalData) {
    Object.assign(enhancedData, data);
  }

  return enhancedData;
};
