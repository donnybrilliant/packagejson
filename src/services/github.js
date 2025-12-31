import fetch from "node-fetch";
import { ENV, ONLY_SAVE_LINKS } from "../../config/index.js";
import { isImage, isVideo, isOtherBinary } from "../utils/extensions.js";
import { logger } from "../middleware/logger.js";
import { packageJsonCache } from "../utils/cache.js";
import semver from "semver";
import { getNetlifySites } from "./netlify.js";
import { getVercelSites } from "./vercel.js";
import { getRenderSites } from "./render.js";
import { getNpmPackageInfo } from "./npmjs.js";

/**
 * Checks the current rate limit status.
 * @async
 * @returns {Promise<Object>} The rate limit status.
 */
async function checkRateLimit() {
  try {
    const response = await fetch(`${ENV.GITHUB_API_URL}/rate_limit`, {
      headers: {
        Authorization: `token ${ENV.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const data = await response.json();
    logger.info(`Rate limit status: ${JSON.stringify(data)}`);
    return data;
  } catch (error) {
    logger.error(`Error in checkRateLimit: ${error.message}`);
  }
}

/**
 * Fetches data from the GitHub API.
 * @async
 * @param {string} endpoint - The API endpoint to call.
 * @returns {Promise<Object>} The data returned from the API.
 */
export async function fetchGitHubAPI(endpoint) {
  try {
    const response = await fetch(`${ENV.GITHUB_API_URL}${endpoint}`, {
      headers: {
        Authorization: `token ${ENV.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    logger.info(
      `API call to ${ENV.GITHUB_API_URL}${endpoint} with status ${response.status} ${response.statusText}`
    );

    if (response.status === 403) {
      logger.error(`403 Forbidden: Rate limit exceeded or token issue.`);
      return null;
    }

    if (response.status === 404) {
      const errorData = await response.json();
      return errorData; // Return error object so calling functions can check for data.message
    }

    return response.json();
  } catch (error) {
    logger.error(`Error in fetchGitHubAPI: ${error.message}`);
    return null;
  }
}

/**
 * Retrieves the repositories of the user.
 * @async
 * @param {string} [type="public"] - Type of repositories to retrieve.
 * @returns {Promise<Array<Object>>} An array of repositories.
 */
export async function getRepositories(type = "public") {
  return fetchGitHubAPI(`/user/repos?type=${type}&per_page=100&sort=updated`);
}

/**
 * Fetches README content from a repository.
 * Tries common README filenames (README.md, README.txt, README, etc.)
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<string|null>} The README content or null if not found.
 */
export async function fetchReadme(repoName, owner = null) {
  const repoOwner = owner || ENV.USERNAME;
  const readmeFiles = [
    "README.md",
    "README.txt",
    "README",
    "readme.md",
    "readme.txt",
    "readme",
  ];

  for (const filename of readmeFiles) {
    const content = await fetchFileContent(
      repoName,
      filename,
      false,
      repoOwner
    );
    if (content && typeof content === "string" && !content.startsWith("http")) {
      // If content is a string and not a link, it's valid README content
      return content;
    }
  }
  return null;
}

/**
 * Fetches all languages used in a repository with their byte counts.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Object|null>} An object mapping language names to byte counts, or null if not found.
 */
export async function fetchRepositoryLanguages(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/languages`
    );

    if (data && data.message) {
      return null;
    }

    return data || null;
  } catch (error) {
    logger.error(`Error in fetchRepositoryLanguages: ${error.message}`);
    return null;
  }
}

/**
 * Fetches commit activity statistics for a repository.
 * Returns the last year of commit activity grouped by week.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Array<Object>|null>} Array of weekly commit activity objects, or null if not found.
 */
export async function fetchCommitActivity(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/stats/commit_activity`
    );

    if (data && data.message) {
      return null;
    }

    // GitHub API may return 202 Accepted if stats are being calculated
    if (Array.isArray(data)) {
      return data;
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchCommitActivity: ${error.message}`);
    return null;
  }
}

/**
 * Fetches contributor statistics for a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Array<Object>|null>} Array of contributor statistics, or null if not found.
 */
export async function fetchContributorStats(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/stats/contributors`
    );

    if (data && data.message) {
      return null;
    }

    // GitHub API may return 202 Accepted if stats are being calculated
    if (Array.isArray(data)) {
      return data;
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchContributorStats: ${error.message}`);
    return null;
  }
}

/**
 * Fetches code frequency statistics (additions and deletions per week).
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Array<Array<number>>|null>} Array of [timestamp, additions, deletions] arrays, or null if not found.
 */
export async function fetchCodeFrequency(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/stats/code_frequency`
    );

    if (data && data.message) {
      return null;
    }

    if (Array.isArray(data)) {
      return data;
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchCodeFrequency: ${error.message}`);
    return null;
  }
}

/**
 * Fetches participation statistics (all commits vs owner commits).
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Object|null>} Object with 'all' and 'owner' arrays of commits per week, or null if not found.
 */
export async function fetchParticipation(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/stats/participation`
    );

    if (data && data.message) {
      return null;
    }

    return data || null;
  } catch (error) {
    logger.error(`Error in fetchParticipation: ${error.message}`);
    return null;
  }
}

/**
 * Fetches recent releases for a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @param {number} [perPage=10] - Number of releases to fetch.
 * @returns {Promise<Array<Object>|null>} Array of release objects, or null if not found.
 */
export async function fetchReleases(repoName, owner = null, perPage = 10) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/releases?per_page=${perPage}`
    );

    if (data && data.message) {
      return null;
    }

    if (Array.isArray(data)) {
      return data;
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchReleases: ${error.message}`);
    return null;
  }
}

/**
 * Fetches GitHub Actions workflows for a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Array<Object>|null>} Array of workflow objects, or null if not found.
 */
export async function fetchWorkflows(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/actions/workflows`
    );

    if (data && data.message) {
      return null;
    }

    if (data && data.workflows) {
      return data.workflows;
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchWorkflows: ${error.message}`);
    return null;
  }
}

/**
 * Fetches workflow runs for a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @param {number} [perPage=10] - Number of workflow runs to fetch.
 * @returns {Promise<Object|null>} Object with workflow runs, or null if not found.
 */
export async function fetchWorkflowRuns(repoName, owner = null, perPage = 10) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/actions/runs?per_page=${perPage}`
    );

    if (data && data.message) {
      return null;
    }

    if (data && data.workflow_runs) {
      return {
        total_count: data.total_count,
        workflow_runs: data.workflow_runs.map((run) => ({
          id: run.id,
          name: run.name,
          head_branch: run.head_branch,
          status: run.status,
          conclusion: run.conclusion,
          created_at: run.created_at,
          updated_at: run.updated_at,
          html_url: run.html_url,
          workflow_id: run.workflow_id,
        })),
      };
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchWorkflowRuns: ${error.message}`);
    return null;
  }
}

/**
 * Fetches the latest CI/CD status for a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Object|null>} Object with latest CI/CD status, or null if not found.
 */
export async function fetchCICDStatus(repoName, owner = null) {
  try {
    const workflowRuns = await fetchWorkflowRuns(repoName, owner, 1);
    if (
      !workflowRuns ||
      !workflowRuns.workflow_runs ||
      workflowRuns.workflow_runs.length === 0
    ) {
      return null;
    }

    const latestRun = workflowRuns.workflow_runs[0];
    return {
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      name: latestRun.name,
      branch: latestRun.head_branch,
      created_at: latestRun.created_at,
      updated_at: latestRun.updated_at,
      html_url: latestRun.html_url,
    };
  } catch (error) {
    logger.error(`Error in fetchCICDStatus: ${error.message}`);
    return null;
  }
}

/**
 * Fetches deployments for a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @param {number} [perPage=10] - Number of deployments to fetch.
 * @returns {Promise<Array<Object>|null>} Array of deployment objects, or null if not found.
 */
export async function fetchDeployments(repoName, owner = null, perPage = 10) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/deployments?per_page=${perPage}`
    );

    if (data && data.message) {
      return null;
    }

    if (Array.isArray(data)) {
      // Fetch deployment statuses for each deployment
      const deploymentsWithStatuses = await Promise.all(
        data.map(async (deployment) => {
          const statuses = await fetchGitHubAPI(
            `/repos/${repoOwner}/${repoName}/deployments/${deployment.id}/statuses`
          );

          return {
            id: deployment.id,
            ref: deployment.ref,
            sha: deployment.sha,
            task: deployment.task,
            environment: deployment.environment,
            description: deployment.description,
            creator: deployment.creator.login,
            created_at: deployment.created_at,
            updated_at: deployment.updated_at,
            statuses: Array.isArray(statuses)
              ? statuses.map((status) => ({
                  state: status.state,
                  description: status.description,
                  environment: status.environment,
                  created_at: status.created_at,
                  target_url: status.target_url,
                }))
              : [],
          };
        })
      );

      return deploymentsWithStatuses;
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchDeployments: ${error.message}`);
    return null;
  }
}

/**
 * Extracts repository owner and name from various URL formats.
 * @param {string} repoUrl - The repository URL in various formats.
 * @returns {Object|null} Object with owner and name, or null if not parseable.
 */
function parseRepoUrl(repoUrl) {
  if (!repoUrl || typeof repoUrl !== "string") {
    return null;
  }

  // Handle different URL formats:
  // https://github.com/owner/repo
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  // git@github.com:owner/repo
  // owner/repo

  let match = repoUrl.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/\.]+)(?:\.git)?/
  );
  if (match) {
    return {
      owner: match[1],
      name: match[2],
    };
  }

  // Try git@ format
  match = repoUrl.match(/git@github\.com:([^\/]+)\/([^\/\.]+)(?:\.git)?/);
  if (match) {
    return {
      owner: match[1],
      name: match[2],
    };
  }

  // Try owner/repo format
  match = repoUrl.match(/^([^\/]+)\/([^\/]+)$/);
  if (match) {
    return {
      owner: match[1],
      name: match[2],
    };
  }

  return null;
}

/**
 * Fetches deployment links from all connected platforms (Netlify, Vercel, Render).
 * Matches deployments to repositories by comparing repository URLs.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Object|null>} Object with deployment links from all platforms, or null if none found.
 */
export async function fetchDeploymentLinks(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const repoFullName = `${repoOwner}/${repoName}`;

    // Cache key for deployment platforms data
    const cacheKey = "deploymentPlatforms";
    let platformsData = packageJsonCache.get(cacheKey);

    // Fetch all platforms if not cached
    if (!platformsData) {
      const [netlifySites, vercelSites, renderSites] = await Promise.all([
        getNetlifySites(),
        getVercelSites(),
        getRenderSites(),
      ]);

      platformsData = {
        netlify: Array.isArray(netlifySites) ? netlifySites : [],
        vercel: Array.isArray(vercelSites) ? vercelSites : [],
        render: Array.isArray(renderSites) ? renderSites : [],
        fetched_at: new Date().toISOString(),
      };

      // Cache for 1 hour (using packageJsonCache with default TTL)
      packageJsonCache.set(cacheKey, platformsData);
    }

    const deployments = {
      netlify: null,
      vercel: null,
      render: null,
    };

    // Match Netlify deployments
    if (Array.isArray(platformsData.netlify)) {
      for (const site of platformsData.netlify) {
        if (site.repo) {
          const parsed = parseRepoUrl(site.repo);
          if (
            parsed &&
            parsed.owner === repoOwner &&
            parsed.name === repoName
          ) {
            deployments.netlify = {
              name: site.name,
              url: site.ssl_url || site.url,
              repo: site.repo,
            };
            break;
          }
        }
      }
    }

    // Match Vercel deployments
    if (Array.isArray(platformsData.vercel)) {
      for (const site of platformsData.vercel) {
        if (site.repo) {
          const parsed = parseRepoUrl(site.repo);
          if (
            parsed &&
            parsed.owner === repoOwner &&
            parsed.name === repoName
          ) {
            deployments.vercel = {
              name: site.name,
              url: site.url,
              repo: site.repo,
              framework: site.framework,
            };
            break;
          }
        }
      }
    }

    // Match Render deployments
    if (Array.isArray(platformsData.render)) {
      for (const site of platformsData.render) {
        if (site.repo) {
          const parsed = parseRepoUrl(site.repo);
          if (
            parsed &&
            parsed.owner === repoOwner &&
            parsed.name === repoName
          ) {
            deployments.render = {
              name: site.name,
              url: site.url,
              repo: site.repo,
            };
            break;
          }
        }
      }
    }

    // Only return if at least one deployment is found
    const hasDeployments =
      deployments.netlify || deployments.vercel || deployments.render;

    return hasDeployments ? deployments : null;
  } catch (error) {
    logger.error(`Error in fetchDeploymentLinks: ${error.message}`);
    return null;
  }
}

/**
 * Fetches package.json and extracts the package name to construct NPM link.
 * Also checks for GitHub Actions workflows that publish to npm.
 * Uses npmjs API to verify package exists and get real package information.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Object|null>} Object with npm package info, or null if not found.
 */
export async function fetchNpmPackageInfo(repoName, owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;

    // Fetch package.json
    const packageJsonContent = await fetchFileContent(
      repoName,
      "package.json",
      false,
      repoOwner
    );

    if (!packageJsonContent || typeof packageJsonContent !== "string") {
      return null;
    }

    let packageJson;
    try {
      packageJson = JSON.parse(packageJsonContent);
    } catch (parseError) {
      logger.error(
        `Error parsing package.json for ${repoOwner}/${repoName}: ${parseError.message}`
      );
      return null;
    }

    if (!packageJson.name) {
      return null;
    }

    const packageName = packageJson.name;

    // Check for GitHub Actions workflows that might publish to npm
    const workflows = await fetchWorkflows(repoName, repoOwner);
    let hasNpmPublishWorkflow = false;
    let npmPublishWorkflow = null;

    if (workflows && Array.isArray(workflows)) {
      // Check workflow files for npm publish actions
      for (const workflow of workflows) {
        const workflowPath = workflow.path;
        if (workflowPath && workflowPath.includes(".github/workflows")) {
          const workflowContent = await fetchFileContent(
            repoName,
            workflowPath,
            false,
            repoOwner
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
              id: workflow.id,
              name: workflow.name,
              path: workflow.path,
              state: workflow.state,
              html_url: workflow.html_url,
            };
            break;
          }
        }
      }
    }

    // Fetch package information from npmjs API
    const npmPackageInfo = await getNpmPackageInfo(packageName);

    // Build response object
    const result = {
      package_name: packageName,
      version: packageJson.version || null,
      npm_link: `https://www.npmjs.com/package/${packageName}`,
      has_npm_publish_workflow: hasNpmPublishWorkflow,
      npm_publish_workflow: npmPublishWorkflow,
      repository: packageJson.repository || null,
    };

    // Add npmjs API data if package exists on npmjs
    if (npmPackageInfo) {
      result.npmjs = {
        exists: true,
        published_version: npmPackageInfo.version,
        description: npmPackageInfo.description,
        homepage: npmPackageInfo.homepage,
        repository: npmPackageInfo.repository,
        keywords: npmPackageInfo.keywords,
        license: npmPackageInfo.license,
        author: npmPackageInfo.author,
        maintainers: npmPackageInfo.maintainers,
        latest_version_published: npmPackageInfo.latest_version_published,
        dist_tags: npmPackageInfo.dist_tags,
        total_versions: npmPackageInfo.versions?.length || 0,
      };
    } else {
      result.npmjs = {
        exists: false,
      };
    }

    return result;
  } catch (error) {
    logger.error(`Error in fetchNpmPackageInfo: ${error.message}`);
    return null;
  }
}

/**
 * Fetches comprehensive repository data including all available information.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @param {Object} [options={}] - Options for what data to fetch.
 * @param {boolean} [options.includeReadme=true] - Whether to include README content.
 * @param {boolean} [options.includeLanguages=true] - Whether to include language statistics.
 * @param {boolean} [options.includeStats=true] - Whether to include contribution statistics.
 * @param {boolean} [options.includeReleases=true] - Whether to include release information.
 * @param {boolean} [options.includeWorkflows=true] - Whether to include GitHub Actions workflows.
 * @param {boolean} [options.includeCICD=true] - Whether to include CI/CD status.
 * @param {boolean} [options.includeDeployments=true] - Whether to include deployment information.
 * @param {boolean} [options.includeNpm=true] - Whether to include NPM package information.
 * @param {boolean} [options.includeDeploymentLinks=true] - Whether to include deployment links from external platforms (Netlify, Vercel, Render).
 * @returns {Promise<Object>} Enhanced repository object with all requested data.
 */
export async function fetchEnhancedRepositoryData(
  repoName,
  owner = null,
  options = {}
) {
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

  const repoOwner = owner || ENV.USERNAME;

  // Fetch base repository data
  const repoData = await fetchGitHubAPI(`/repos/${repoOwner}/${repoName}`);

  if (!repoData || repoData.message) {
    return null;
  }

  // Build enhanced data object
  const enhancedData = {
    // Basic info
    name: repoData.name,
    full_name: repoData.full_name,
    description: repoData.description,
    html_url: repoData.html_url,
    homepage: repoData.homepage,
    language: repoData.language, // Primary language
    default_branch: repoData.default_branch,

    // Stats
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    watchers: repoData.watchers_count,
    open_issues: repoData.open_issues_count,
    size: repoData.size, // Size in KB

    // Dates
    created_at: repoData.created_at,
    updated_at: repoData.updated_at,
    pushed_at: repoData.pushed_at,

    // Metadata
    topics: repoData.topics || [],
    license: repoData.license
      ? {
          key: repoData.license.key,
          name: repoData.license.name,
          spdx_id: repoData.license.spdx_id,
          url: repoData.license.url,
        }
      : null,
    archived: repoData.archived,
    disabled: repoData.disabled,
    private: repoData.private,
    fork: repoData.fork,

    // GitHub Pages
    has_pages: repoData.has_pages,
    pages_url: repoData.has_pages
      ? `https://${repoOwner}.github.io/${repoName}`
      : null,

    // Owner info
    owner: {
      login: repoData.owner.login,
      avatar_url: repoData.owner.avatar_url,
      html_url: repoData.owner.html_url,
    },

    // URLs
    deployments_url: repoData.deployments_url,
    releases_url: repoData.releases_url,
    issues_url: repoData.issues_url,
    pulls_url: repoData.pulls_url,
  };

  // Fetch additional data in parallel
  const additionalDataPromises = [];

  if (includeReadme) {
    additionalDataPromises.push(
      fetchReadme(repoName, repoOwner).then((readme) => ({ readme }))
    );
  }

  if (includeLanguages) {
    additionalDataPromises.push(
      fetchRepositoryLanguages(repoName, repoOwner).then((languages) => ({
        languages,
      }))
    );
  }

  if (includeStats) {
    additionalDataPromises.push(
      Promise.all([
        fetchCommitActivity(repoName, repoOwner),
        fetchContributorStats(repoName, repoOwner),
        fetchCodeFrequency(repoName, repoOwner),
        fetchParticipation(repoName, repoOwner),
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
      fetchReleases(repoName, repoOwner).then((releases) => ({ releases }))
    );
  }

  if (includeWorkflows) {
    additionalDataPromises.push(
      Promise.all([
        fetchWorkflows(repoName, repoOwner),
        fetchWorkflowRuns(repoName, repoOwner),
      ]).then(([workflows, workflowRuns]) => ({
        workflows: workflows,
        workflow_runs: workflowRuns,
      }))
    );
  }

  if (includeCICD) {
    additionalDataPromises.push(
      fetchCICDStatus(repoName, repoOwner).then((cicdStatus) => ({
        cicd_status: cicdStatus,
      }))
    );
  }

  if (includeDeployments) {
    additionalDataPromises.push(
      fetchDeployments(repoName, repoOwner).then((deployments) => ({
        deployments: deployments,
      }))
    );
  }

  if (includeNpm) {
    additionalDataPromises.push(
      fetchNpmPackageInfo(repoName, repoOwner).then((npmInfo) => ({
        npm: npmInfo,
      }))
    );
  }

  if (includeDeploymentLinks) {
    additionalDataPromises.push(
      fetchDeploymentLinks(repoName, repoOwner).then((deploymentLinks) => ({
        deployment_links: deploymentLinks,
      }))
    );
  }

  // Wait for all additional data
  const additionalData = await Promise.all(additionalDataPromises);

  // Merge additional data into enhanced data
  additionalData.forEach((data) => {
    Object.assign(enhancedData, data);
  });

  return enhancedData;
}

/**
 * Retrieves the package details for a given repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Object|null>} An object containing the dependencies and devDependencies, or null if not found.
 */
export async function getPackageDetails(repoName, owner = null) {
  const packageJsonContent = await fetchFileContent(
    repoName,
    "package.json",
    false,
    owner
  );
  if (packageJsonContent) {
    const packageJson = JSON.parse(packageJsonContent);
    return {
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
    };
  }
  return null;
}

/**
 * Fetches the folder structure for a given repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} [path=""] - The path inside the repository.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<Object|null>} An object representing the folder structure.
 */
export async function fetchFolderStructure(repoName, path = "", owner = null) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/contents/${path}`
    );

    // Check if the response is an error (e.g., 404 Not Found)
    if (data && data.message) {
      logger.error(
        `GitHub API error for ${repoOwner}/${repoName}: ${data.message}`
      );
      return null;
    }

    if (Array.isArray(data)) {
      const structure = {};
      for (const item of data) {
        if (item.type === "dir") {
          structure[item.name] = await fetchFolderStructure(
            repoName,
            item.path,
            repoOwner
          );
        } else if (item.type === "file") {
          structure[item.name] = await fetchFileContent(
            repoName,
            item.path,
            ONLY_SAVE_LINKS,
            repoOwner
          );
        }
      }
      return structure;
    }
    return null;
  } catch (error) {
    logger.error(`Error in fetchFolderStructure: ${error.message}`);
    return null;
  }
}

/**
 * Fetches the content of a file in a repository.
 * @async
 * @param {string} repoName - The name of the repository.
 * @param {string} filePath - Path to the file inside the repository.
 * @param {boolean} [alwaysProvideLink=false] - Whether to always return a link regardless of the file type.
 * @param {string} [owner] - The owner of the repository (username or organization). Defaults to ENV.USERNAME.
 * @returns {Promise<string|null>} The content of the file or a link to it, or null if not found.
 */
export async function fetchFileContent(
  repoName,
  filePath,
  alwaysProvideLink = false,
  owner = null
) {
  try {
    const repoOwner = owner || ENV.USERNAME;
    const data = await fetchGitHubAPI(
      `/repos/${repoOwner}/${repoName}/contents/${filePath}`
    );

    // Check if the response is an error (e.g., 404 Not Found)
    if (data && data.message) {
      logger.error(
        `GitHub API error for ${repoOwner}/${repoName}/${filePath}: ${data.message}`
      );
      return null;
    }

    if (
      alwaysProvideLink ||
      (data && (isImage(data) || isVideo(data) || isOtherBinary(data)))
    ) {
      return `https://github.com/${repoOwner}/${repoName}/blob/main/${filePath}`;
    }

    if (data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }

    return null;
  } catch (error) {
    logger.error(`Error in fetchFileContent: ${error.message}`);
    return null;
  }
}

/**
 * Fetches aggregated dependency data from all repositories of the user.
 * @async
 * @param {string} [versionType="max"] - The type of version to fetch (min, max, or minmax).
 * @returns {Promise<Object|null>} An object containing aggregated dependency data.
 */
export async function fetchAggregatedData(versionType = "max") {
  try {
    const cachedData = packageJsonCache.get(`packageData-${versionType}`);
    if (cachedData) {
      return cachedData;
    }

    const repos = await getRepositories("all");

    const aggregatedData = {
      dependencies: {},
      devDependencies: {},
    };

    const tempData = {
      dependencies: {},
      devDependencies: {},
    };

    for (const repo of repos) {
      // Use repo.owner.login to handle repos from organizations or other users
      const owner = repo.owner?.login || repo.full_name?.split("/")[0];
      const packageDetails = await getPackageDetails(repo.name, owner);
      if (packageDetails) {
        aggregateVersion(
          aggregatedData.dependencies,
          packageDetails.dependencies,
          versionType,
          "dependencies",
          tempData
        );
        aggregateVersion(
          aggregatedData.devDependencies,
          packageDetails.devDependencies,
          versionType,
          "devDependencies",
          tempData
        );
      }
    }

    // Sort dependencies and devDependencies alphabetically
    aggregatedData.dependencies = sortObjectKeys(aggregatedData.dependencies);
    aggregatedData.devDependencies = sortObjectKeys(
      aggregatedData.devDependencies
    );

    packageJsonCache.set(`packageData-${versionType}`, aggregatedData);
    return aggregatedData;
  } catch (error) {
    logger.error(`Error in fetchAggregatedData ${error.message}`);
  }
}

/**
 * Aggregates dependency versions.
 * @param {Object} aggregated - The aggregated dependency data.
 * @param {Object} current - The current repository's dependency data.
 * @param {string} [versionType="max"] - The type of version to fetch (min, max, or minmax).
 * @param {string} depType - Type of dependencies (dependencies or devDependencies).
 * @param {Object} tempData - Temporary data for aggregating versions.
 */
function aggregateVersion(
  aggregated,
  current,
  versionType = "max",
  depType,
  tempData
) {
  for (const [name, version] of Object.entries(current || {})) {
    const cleanedCurrentVersion = semver.coerce(version);

    if (!tempData[depType][name]) {
      tempData[depType][name] = {
        min: cleanedCurrentVersion.version,
        max: cleanedCurrentVersion.version,
      };
    } else {
      const cleanedMinVersion = semver.coerce(tempData[depType][name].min);
      const cleanedMaxVersion = semver.coerce(tempData[depType][name].max);

      if (semver.lt(cleanedCurrentVersion, cleanedMinVersion)) {
        tempData[depType][name].min = cleanedCurrentVersion.version;
      }

      if (semver.gt(cleanedCurrentVersion, cleanedMaxVersion)) {
        tempData[depType][name].max = cleanedCurrentVersion.version;
      }
    }
  }

  for (const [name, versionData] of Object.entries(tempData[depType])) {
    if (versionType === "min") {
      aggregated[name] = versionData.min;
    } else if (versionType === "max") {
      aggregated[name] = versionData.max;
    } else if (versionType === "minmax") {
      aggregated[name] =
        versionData.min === versionData.max
          ? versionData.min
          : `${versionData.min} - ${versionData.max}`;
    }
  }
}

/**
 * Fetches enhanced data for all repositories.
 * @async
 * @param {string} [type="public"] - Type of repositories to retrieve.
 * @param {Object} [options={}] - Options for what data to fetch (see fetchEnhancedRepositoryData).
 * @returns {Promise<Array<Object>>} Array of enhanced repository objects.
 */
export async function getEnhancedRepositories(type = "public", options = {}) {
  try {
    const repos = await getRepositories(type);
    if (!repos || !Array.isArray(repos)) {
      return [];
    }

    // Fetch enhanced data for all repos
    // Note: This may take a while and use many API calls
    const enhancedRepos = await Promise.all(
      repos.map(async (repo) => {
        const owner = repo.owner?.login || repo.full_name?.split("/")[0];
        return await fetchEnhancedRepositoryData(repo.name, owner, options);
      })
    );

    // Filter out null results (repos that couldn't be fetched)
    return enhancedRepos.filter((repo) => repo !== null);
  } catch (error) {
    logger.error(`Error in getEnhancedRepositories: ${error.message}`);
    return [];
  }
}

/**
 * Sorts an object's keys alphabetically and returns a new object.
 * @param {Object} obj - The object to sort.
 * @returns {Object} A new object with sorted keys.
 */
function sortObjectKeys(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((sortedObj, key) => {
      sortedObj[key] = obj[key];
      return sortedObj;
    }, {});
}

// Call this function at the start of your service or before making API calls
checkRateLimit();
