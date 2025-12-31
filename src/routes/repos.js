import handleResponseType from "../middleware/handleResponseType.js";
import { ENV } from "../../config/index.js";
import {
  getRepositories,
  fetchEnhancedRepositoryData,
  fetchReadme,
  fetchRepositoryLanguages,
  fetchCommitActivity,
  fetchContributorStats,
  fetchCodeFrequency,
  fetchParticipation,
  fetchReleases,
  fetchWorkflows,
  fetchWorkflowRuns,
  fetchCICDStatus,
  fetchDeployments,
  fetchNpmPackageInfo,
  fetchDeploymentLinks,
} from "../services/github.js";

/**
 * Parses comma-separated query parameter into array of trimmed strings
 * @param {string} str - Comma-separated string
 * @returns {Array<string>} Array of trimmed strings
 */
function parseCommaSeparatedList(str) {
  if (!str || typeof str !== "string") return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Selects specific fields from an object
 * @param {Object} obj - Source object
 * @param {Array<string>} fields - Array of field names to select
 * @returns {Object} Object with only selected fields
 */
function selectFields(obj, fields) {
  if (!fields || fields.length === 0) return obj;
  const result = {};
  fields.forEach((field) => {
    if (obj.hasOwnProperty(field)) {
      result[field] = obj[field];
    }
  });
  return result;
}

/**
 * Sorts repositories by specified field
 * @param {Array} repos - Array of repositories
 * @param {string} sortBy - Field to sort by
 * @returns {Array} Sorted array
 */
function sortRepos(repos, sortBy) {
  const sorted = [...repos];
  switch (sortBy) {
    case "stars":
      return sorted.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    case "name":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "updated":
    default:
      return sorted.sort(
        (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
      );
  }
}

/**
 * Paginates an array
 * @param {Array} array - Array to paginate
 * @param {number} limit - Number of items per page
 * @param {number} offset - Starting offset
 * @returns {Object} Object with data, meta, and links
 */
function paginate(array, limit, offset) {
  const total = array.length;
  const limitNum = Math.max(1, parseInt(limit) || 100);
  const offsetNum = Math.max(0, parseInt(offset) || 0);
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
}

/**
 * Converts include list to options object for fetchEnhancedRepositoryData
 * @param {Array<string>} includeList - Array of fields to include
 * @returns {Object} Options object with boolean flags
 */
function convertIncludeListToOptions(includeList) {
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
}

/**
 * Formats basic repository data from GitHub API response
 * @param {Object} repo - Repository object from GitHub API
 * @returns {Object} Formatted repository object
 */
function formatBasicRepo(repo) {
  const owner = repo.owner?.login || repo.full_name?.split("/")[0];
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
}

/**
 * The reposRoutes function sets up RESTful routes for repository data.
 *
 * @param {Object} app - An instance of the Express.js application.
 * @returns {void}
 */
function reposRoutes(app) {
  // The handleResponseType middleware
  app.use("/repos", handleResponseType);

  /**
   * @openapi
   * /repos:
   *   get:
   *     description: List repositories with optional filtering and field selection
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [all, public, private]
   *           default: public
   *         description: Filter by repository visibility
   *       - in: query
   *         name: include
   *         schema:
   *           type: string
   *         description: Comma-separated list of fields to include (readme, languages, stats, releases, workflows, cicd, deployments, npm, deployment-links)
   *       - in: query
   *         name: fields
   *         schema:
   *           type: string
   *         description: Comma-separated list of specific fields to return
   *       - in: query
   *         name: sort
   *         schema:
   *           type: string
   *           enum: [updated, stars, name]
   *           default: updated
   *         description: Sort repositories by field
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 100
   *         description: Maximum number of repositories to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of repositories to skip
   *     responses:
   *       200:
   *         description: A list of repositories with metadata
   */
  app.get("/repos", async (req, res, next) => {
    try {
      const {
        type = "public",
        include = "",
        fields = "",
        sort = "updated",
        limit = 100,
        offset = 0,
      } = req.query;

      const includeList = parseCommaSeparatedList(include);
      const fieldsList = parseCommaSeparatedList(fields);

      // Fetch basic repository data
      const repos = await getRepositories(type);
      if (!repos || !Array.isArray(repos)) {
        return res.json({
          data: [],
          meta: { total: 0, limit: parseInt(limit), offset: parseInt(offset) },
        });
      }

      // Format basic repository data
      let result = repos.map((repo) => formatBasicRepo(repo));

      // Apply includes (expensive operations) if requested
      if (includeList.length > 0) {
        result = await Promise.all(
          result.map(async (repo) => {
            const owner = repo.owner?.login || ENV.USERNAME;
            const options = convertIncludeListToOptions(includeList);
            const enhanced = await fetchEnhancedRepositoryData(
              repo.name,
              owner,
              options
            );

            if (enhanced) {
              // Merge enhanced data, keeping basic structure
              return {
                ...repo,
                ...enhanced,
              };
            }
            return repo;
          })
        );
      }

      // Apply field selection if specified
      if (fieldsList.length > 0) {
        result = result.map((repo) => selectFields(repo, fieldsList));
      }

      // Sort repositories
      result = sortRepos(result, sort);

      // Paginate
      const paginated = paginate(result, limit, offset);

      // Format response
      const response = {
        data: paginated.data,
        meta: paginated.meta,
      };

      if (req.isHtmlRequest) {
        const listItems = paginated.data
          .map((repo) => {
            const description = repo.description
              ? ` - ${repo.description}`
              : "";
            const stars = repo.stars ? ` ⭐ ${repo.stars}` : "";
            return `<li><a href="${repo.html_url}">${repo.name}</a>${description}${stars}</li>`;
          })
          .join("\n");

        return res.send(
          `<ul style="list-style: none; margin: 0; padding: 0;">${listItems}</ul>`
        );
      } else if (req.isJsonRequest) {
        return res.json(response);
      }
    } catch (error) {
      next(error);
    }
  });

  /**
   * @openapi
   * /repos/{owner}/{repo}:
   *   get:
   *     description: Get detailed information about a specific repository
   *     parameters:
   *       - in: path
   *         name: owner
   *         required: true
   *         schema:
   *           type: string
   *         description: Repository owner (username or organization)
   *       - in: path
   *         name: repo
   *         required: true
   *         schema:
   *           type: string
   *         description: Repository name
   *       - in: query
   *         name: include
   *         schema:
   *           type: string
   *         description: Comma-separated list of fields to include
   *       - in: query
   *         name: fields
   *         schema:
   *           type: string
   *         description: Comma-separated list of specific fields to return
   *     responses:
   *       200:
   *         description: Repository details
   *       404:
   *         description: Repository not found
   */
  app.get("/repos/:owner/:repo", async (req, res, next) => {
    try {
      const { owner, repo } = req.params;
      const { include = "", fields = "" } = req.query;

      const includeList = parseCommaSeparatedList(include);
      const fieldsList = parseCommaSeparatedList(fields);

      // If no includes specified, include everything by default
      const options =
        includeList.length > 0
          ? convertIncludeListToOptions(includeList)
          : {
              includeReadme: true,
              includeLanguages: true,
              includeStats: true,
              includeReleases: true,
              includeWorkflows: true,
              includeCICD: true,
              includeDeployments: true,
              includeNpm: true,
              includeDeploymentLinks: true,
            };

      const repoData = await fetchEnhancedRepositoryData(repo, owner, options);

      if (!repoData) {
        return res.status(404).json({
          error: "Repository not found",
          message: `Repository ${owner}/${repo} not found or not accessible`,
        });
      }

      // Apply field selection if specified
      const result =
        fieldsList.length > 0 ? selectFields(repoData, fieldsList) : repoData;

      // Add links to nested resources
      if (!fieldsList.length || fieldsList.includes("_links")) {
        result._links = {
          readme: `/repos/${owner}/${repo}/readme`,
          languages: `/repos/${owner}/${repo}/languages`,
          stats: `/repos/${owner}/${repo}/stats`,
          releases: `/repos/${owner}/${repo}/releases`,
          workflows: `/repos/${owner}/${repo}/workflows`,
          cicd: `/repos/${owner}/${repo}/cicd`,
          deployments: `/repos/${owner}/${repo}/deployments`,
          npm: `/repos/${owner}/${repo}/npm`,
          "deployment-links": `/repos/${owner}/${repo}/deployment-links`,
        };
      }

      return res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Creates a handler for nested resource endpoints
   * @param {Function} fetchFn - Function to fetch the resource
   * @param {string} resourceName - Name of the resource for error messages
   * @param {Object} options - Options for the handler
   * @param {boolean} options.required - Whether the resource is required (returns 404 if not found)
   * @param {Function} options.transform - Optional transform function for the data
   * @returns {Function} Express route handler
   */
  function createNestedResourceHandler(fetchFn, resourceName, options = {}) {
    return async (req, res, next) => {
      try {
        const { owner, repo } = req.params;
        const data = await fetchFn(repo, owner);

        if (options.required && !data) {
          return res.status(404).json({
            error: `${resourceName} not found`,
            message: `${resourceName} not found for ${owner}/${repo}`,
          });
        }

        const result = options.transform ? options.transform(data) : data;
        return res.json({ data: result });
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * @openapi
   * /repos/{owner}/{repo}/readme:
   *   get:
   *     description: Get README content for a repository
   *     parameters:
   *       - in: path
   *         name: owner
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: repo
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: README content
   *       404:
   *         description: README not found
   */
  app.get(
    "/repos/:owner/:repo/readme",
    createNestedResourceHandler(fetchReadme, "README", {
      required: true,
      transform: (readme) => ({ readme }),
    })
  );

  /**
   * @openapi
   * /repos/{owner}/{repo}/languages:
   *   get:
   *     description: Get language statistics for a repository
   */
  app.get(
    "/repos/:owner/:repo/languages",
    createNestedResourceHandler(fetchRepositoryLanguages, "Languages", {
      transform: (languages) => ({ languages: languages || {} }),
    })
  );

  /**
   * @openapi
   * /repos/{owner}/{repo}/stats:
   *   get:
   *     description: Get contribution statistics for a repository
   *     parameters:
   *       - in: query
   *         name: include
   *         schema:
   *           type: string
   *         description: Comma-separated list of stats to include (commit_activity, contributors, code_frequency, participation)
   */
  app.get("/repos/:owner/:repo/stats", async (req, res, next) => {
    try {
      const { owner, repo } = req.params;
      const { include = "" } = req.query;
      const includeList = parseCommaSeparatedList(include);

      const stats = {};

      if (includeList.length === 0 || includeList.includes("commit_activity")) {
        stats.commit_activity = await fetchCommitActivity(repo, owner);
      }
      if (includeList.length === 0 || includeList.includes("contributors")) {
        stats.contributors = await fetchContributorStats(repo, owner);
      }
      if (includeList.length === 0 || includeList.includes("code_frequency")) {
        stats.code_frequency = await fetchCodeFrequency(repo, owner);
      }
      if (includeList.length === 0 || includeList.includes("participation")) {
        stats.participation = await fetchParticipation(repo, owner);
      }

      return res.json({ data: { stats } });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @openapi
   * /repos/{owner}/{repo}/releases:
   *   get:
   *     description: Get releases for a repository
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   */
  app.get("/repos/:owner/:repo/releases", async (req, res, next) => {
    try {
      const { owner, repo } = req.params;
      const { limit = 10 } = req.query;
      const releases = await fetchReleases(repo, owner, parseInt(limit));
      return res.json({ data: { releases: releases || [] } });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @openapi
   * /repos/{owner}/{repo}/workflows/runs:
   *   get:
   *     description: Get workflow runs for a repository
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   */
  app.get("/repos/:owner/:repo/workflows/runs", async (req, res, next) => {
    try {
      const { owner, repo } = req.params;
      const { limit = 10 } = req.query;
      const workflowRuns = await fetchWorkflowRuns(
        repo,
        owner,
        parseInt(limit)
      );
      return res.json({
        data: workflowRuns || { total_count: 0, workflow_runs: [] },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @openapi
   * /repos/{owner}/{repo}/workflows:
   *   get:
   *     description: Get GitHub Actions workflows for a repository
   */
  app.get(
    "/repos/:owner/:repo/workflows",
    createNestedResourceHandler(fetchWorkflows, "Workflows", {
      transform: (workflows) => ({ workflows: workflows || [] }),
    })
  );

  /**
   * @openapi
   * /repos/{owner}/{repo}/cicd:
   *   get:
   *     description: Get CI/CD status for a repository
   */
  app.get(
    "/repos/:owner/:repo/cicd",
    createNestedResourceHandler(fetchCICDStatus, "CI/CD Status", {
      transform: (cicdStatus) => ({ cicd_status: cicdStatus }),
    })
  );

  /**
   * @openapi
   * /repos/{owner}/{repo}/deployments:
   *   get:
   *     description: Get deployments for a repository
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   */
  app.get("/repos/:owner/:repo/deployments", async (req, res, next) => {
    try {
      const { owner, repo } = req.params;
      const { limit = 10 } = req.query;
      const deployments = await fetchDeployments(repo, owner, parseInt(limit));
      return res.json({ data: { deployments: deployments || [] } });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @openapi
   * /repos/{owner}/{repo}/npm:
   *   get:
   *     description: Get NPM package information for a repository
   */
  app.get(
    "/repos/:owner/:repo/npm",
    createNestedResourceHandler(fetchNpmPackageInfo, "NPM Package Info", {
      transform: (npmInfo) => ({ npm: npmInfo }),
    })
  );

  /**
   * @openapi
   * /repos/{owner}/{repo}/deployment-links:
   *   get:
   *     description: Get deployment links from external platforms (Netlify, Vercel, Render)
   */
  app.get(
    "/repos/:owner/:repo/deployment-links",
    createNestedResourceHandler(fetchDeploymentLinks, "Deployment Links", {
      transform: (deploymentLinks) => ({ deployment_links: deploymentLinks }),
    })
  );
}

export default reposRoutes;
