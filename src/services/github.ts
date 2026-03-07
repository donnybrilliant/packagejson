import { cache } from "@/cache";
import { env } from "@/env";
import { CACHE_TTLS } from "@/env";
import { getErrorMessage, isArray, isRecord } from "@/utils/errors";
import {
  handleGitHubResponse,
  isValidGitHubResponse,
  GitHubRateLimitError,
} from "@/utils/github";
import { log } from "@/utils/logger";
import type { JsonObject, JsonValue } from "@/types/json";

type GitHubRepo = {
  name: string;
  full_name: string;
  description?: string | null;
  html_url?: string;
  homepage?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  watchers_count?: number;
  open_issues_count?: number;
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
  topics?: string[];
  license?: {
    name?: string;
    spdx_id?: string;
    url?: string;
  } | null;
  has_pages?: boolean;
  owner: {
    login: string;
    avatar_url?: string;
    html_url?: string;
  };
  private?: boolean;
  archived?: boolean;
  fork?: boolean;
  default_branch?: string;
  size?: number;
  disabled?: boolean;
  deployments_url?: string;
  releases_url?: string;
  issues_url?: string;
  pulls_url?: string;
};

type GitHubContentItem = {
  name: string;
  type: "file" | "dir";
  path: string;
  size?: number;
  content?: string;
  message?: string;
};

type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

type GitHubTreeResponse = {
  tree?: GitHubTreeItem[];
  truncated?: boolean;
};

type TestRepositoryFixture = {
  repo: GitHubRepo;
  readme: string;
  languages: Record<string, number>;
  packageJson: JsonObject;
  deployments: JsonObject[];
  files: Record<string, string>;
};

const TEST_REPOSITORIES: TestRepositoryFixture[] = [
  {
    repo: {
      name: "test-repo",
      full_name: "test-owner/test-repo",
      description: "TypeScript API for package aggregation",
      html_url: "https://github.com/test-owner/test-repo",
      homepage: "https://test-repo.example.com",
      language: "TypeScript",
      stargazers_count: 42,
      forks_count: 7,
      watchers_count: 12,
      open_issues_count: 1,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-06-01T00:00:00Z",
      pushed_at: "2024-06-01T00:00:00Z",
      topics: ["portfolio", "api"],
      license: {
        name: "MIT License",
        spdx_id: "MIT",
        url: "https://api.github.com/licenses/mit",
      },
      has_pages: true,
      owner: {
        login: "test-owner",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        html_url: "https://github.com/test-owner",
      },
      private: false,
      archived: false,
      fork: false,
      default_branch: "main",
      size: 128,
      disabled: false,
      deployments_url: "https://api.github.com/repos/test-owner/test-repo/deployments",
      releases_url: "https://api.github.com/repos/test-owner/test-repo/releases{/id}",
      issues_url: "https://api.github.com/repos/test-owner/test-repo/issues{/number}",
      pulls_url: "https://api.github.com/repos/test-owner/test-repo/pulls{/number}",
    },
    readme:
      "# test-repo\n\nA reference API repository used in tests.\n\nContains package metadata and deployment samples.",
    languages: {
      TypeScript: 2048,
      JavaScript: 256,
    },
    packageJson: {
      name: "@test/test-repo",
      version: "1.2.3",
      repository: "https://github.com/test-owner/test-repo",
    },
    files: {
      "package.json": '{"name":"@test/test-repo"}',
      "README.md": "# test-repo\nThis repo is used for test fixtures.",
      "src/index.ts": "export default {};",
      "docs/readme.md": "hello docs",
      "docs/readme (1).md": "file with space and parens in path",
    },
    deployments: [
      {
        id: 1001,
        ref: "main",
        sha: "abc123",
        task: "deploy",
        environment: "production",
        description: "Production deployment",
        creator: "test-owner",
        created_at: "2024-06-01T00:00:00Z",
        updated_at: "2024-06-01T00:00:00Z",
        statuses: [
          {
            state: "success",
            description: "Deployment successful",
            environment: "production",
            created_at: "2024-06-01T00:00:00Z",
            target_url: "https://test-repo.example.com",
          },
        ],
      },
    ],
  },
  {
    repo: {
      name: "readme-only-repo",
      full_name: "test-owner/readme-only-repo",
      description: "Repository with keyword only in README",
      html_url: "https://github.com/test-owner/readme-only-repo",
      homepage: null,
      language: "JavaScript",
      stargazers_count: 5,
      forks_count: 1,
      watchers_count: 2,
      open_issues_count: 0,
      created_at: "2024-01-15T00:00:00Z",
      updated_at: "2024-05-15T00:00:00Z",
      pushed_at: "2024-05-15T00:00:00Z",
      topics: ["docs"],
      license: null,
      has_pages: false,
      owner: {
        login: "test-owner",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        html_url: "https://github.com/test-owner",
      },
      private: false,
      archived: false,
      fork: false,
      default_branch: "main",
      size: 64,
      disabled: false,
      deployments_url: "https://api.github.com/repos/test-owner/readme-only-repo/deployments",
      releases_url: "https://api.github.com/repos/test-owner/readme-only-repo/releases{/id}",
      issues_url: "https://api.github.com/repos/test-owner/readme-only-repo/issues{/number}",
      pulls_url: "https://api.github.com/repos/test-owner/readme-only-repo/pulls{/number}",
    },
    readme:
      "# readme-only-repo\n\nThis README contains the nebula keyword for search tests.",
    languages: {
      JavaScript: 1000,
    },
    packageJson: {
      name: "@test/missing-package",
      version: "0.1.0",
      repository: "https://github.com/test-owner/readme-only-repo",
    },
    files: {
      "package.json": '{"name":"@test/missing-package"}',
      "README.md": "# readme-only-repo\n\nThis README contains the nebula keyword for search tests.",
    },
    deployments: [],
  },
];

const getTestRepository = (repoName: string, owner: string): TestRepositoryFixture | null => {
  return (
    TEST_REPOSITORIES.find(
      (fixture) => fixture.repo.name === repoName && fixture.repo.owner.login === owner,
    ) ?? null
  );
};

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".tiff",
  ".ico",
  ".pdf",
];

const VIDEO_EXTENSIONS = [".mp4", ".avi", ".mov", ".mkv", ".flv", ".webm", ".m4v"];

const isImage = (data: GitHubContentItem): boolean => {
  if (!data || !data.name || data.type !== "file") return false;
  return IMAGE_EXTENSIONS.some((ext) => data.name.toLowerCase().endsWith(ext));
};

const isVideo = (data: GitHubContentItem): boolean => {
  if (!data || !data.name || data.type !== "file") return false;
  return VIDEO_EXTENSIONS.some((ext) => data.name.toLowerCase().endsWith(ext));
};

const isOtherBinary = (data: GitHubContentItem): boolean => {
  return data.type === "file" && (data.size ?? 0) > 1_000_000;
};

const createGitHubBlobUrl = (
  owner: string,
  repoName: string,
  ref: string,
  filePath: string,
): string => {
  const encodedRef = ref
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const encodedPath = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://github.com/${owner}/${repoName}/blob/${encodedRef}/${encodedPath}`;
};

const assignNestedPath = (
  root: JsonObject,
  filePath: string,
  value: string,
): void => {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length === 0) return;

  let current = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const existing = current[segment];
    if (!isRecord(existing)) {
      current[segment] = {};
    }
    current = current[segment] as JsonObject;
  }

  current[segments[segments.length - 1]] = value;
};

const buildTestFolderStructure = (
  fixture: TestRepositoryFixture,
  owner: string,
  ref: string,
): JsonObject => {
  const structure: JsonObject = {};
  for (const filePath of Object.keys(fixture.files)) {
    assignNestedPath(
      structure,
      filePath,
      createGitHubBlobUrl(owner, fixture.repo.name, ref, filePath),
    );
  }
  return structure;
};

/**
 * Fetches data from the GitHub API
 * @param endpoint - API endpoint (e.g., "/repos/owner/repo")
 * @returns Promise that resolves to the JSON data, error object, or null
 */
export const fetchGitHubAPI = async (endpoint: string): Promise<JsonValue | null> => {
  if (env.NODE_ENV === "test") {
    const repoMatch = endpoint.match(/^\/repos\/([^/]+)\/([^/?]+)$/);
    if (repoMatch) {
      const [, owner, repoName] = repoMatch;
      const fixture = getTestRepository(repoName, owner);
      return fixture?.repo ?? { message: "Not Found" };
    }

    return null;
  }

  if (!env.GITHUB_TOKEN) {
    log("error", "GITHUB_TOKEN is not configured", { endpoint });
    return null;
  }

  try {
    const url = `${env.GITHUB_API_URL}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    return await handleGitHubResponse(response, endpoint);
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      throw error;
    }
    log("error", "Error in fetchGitHubAPI", {
      endpoint,
      error: getErrorMessage(error),
    });
    return null;
  }
};

const REPOS_CACHE_KEY_PREFIX = "github-repos:";
const REPOS_PER_PAGE = 100;
const MAX_REPOS_PAGES = 50;

/**
 * Fetches repositories for the authenticated user.
 * Result is cached by type so files, repos, and package endpoints share one list and avoid duplicate API calls.
 * @param type - Repository type: "all", "public", or "private" (default: "public")
 * @returns Promise that resolves to an array of repositories or null
 */
export const getRepositories = async (type: string = "public"): Promise<GitHubRepo[] | null> => {
  const effectiveType =
    (type === "private" || type === "all") && !env.REPOS_ALLOW_PRIVATE ? "public" : type;

  if (env.NODE_ENV === "test") {
    if (effectiveType === "private") return [];
    return TEST_REPOSITORIES.map((fixture) => fixture.repo);
  }

  const cacheKey = `${REPOS_CACHE_KEY_PREFIX}${effectiveType}`;
  const cached = await cache.get<GitHubRepo[]>(cacheKey);
  if (cached && isArray(cached)) {
    return cached;
  }

  const username = env.USERNAME.trim();
  const baseEndpoint =
    effectiveType === "public" && username
      ? `/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated`
      : `/user/repos?type=${effectiveType}&sort=updated`;

  const repos: GitHubRepo[] = [];

  for (let page = 1; page <= MAX_REPOS_PAGES; page += 1) {
    const endpoint = `${baseEndpoint}&per_page=${REPOS_PER_PAGE}&page=${page}`;
    const data = await fetchGitHubAPI(endpoint);

    if (!isArray(data)) {
      return page === 1 ? null : repos;
    }

    const pageRepos = data as GitHubRepo[];
    if (pageRepos.length === 0) {
      break;
    }

    repos.push(...pageRepos);
    if (pageRepos.length < REPOS_PER_PAGE) {
      break;
    }

    if (page === MAX_REPOS_PAGES) {
      log("warn", "Reached repository pagination safety limit", {
        type,
        maxPages: MAX_REPOS_PAGES,
        reposLoaded: repos.length,
      });
    }
  }

  await cache.set(cacheKey, repos, CACHE_TTLS.short);
  return repos;
};

/**
 * Fetches file content from a repository
 * @param repoName - Repository name
 * @param filePath - Path to the file in the repository
 * @param owner - Repository owner (username or organization)
 * @param alwaysProvideLink - If true, always return a GitHub link instead of content
 * @returns Promise that resolves to file content, GitHub link, or null
 */
export const fetchFileContent = async (
  repoName: string,
  filePath: string,
  owner: string,
  alwaysProvideLink = false,
): Promise<string | null> => {
  if (env.NODE_ENV === "test") {
    const fixture = getTestRepository(repoName, owner);
    if (!fixture) return null;
    const ref = fixture.repo.default_branch ?? "main";

    if (alwaysProvideLink) {
      return createGitHubBlobUrl(owner, repoName, ref, filePath);
    }

    if (filePath in fixture.files) {
      return fixture.files[filePath];
    }

    return null;
  }

  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/contents/${filePath}`);

  if (!isValidGitHubResponse(data) || !isRecord(data)) {
    return null;
  }

  const item = data as GitHubContentItem;
  if (item.message) {
    return null;
  }

  if (alwaysProvideLink || isImage(item) || isVideo(item) || isOtherBinary(item)) {
    return createGitHubBlobUrl(owner, repoName, "main", filePath);
  }

  if (item.content) {
    return Buffer.from(item.content, "base64").toString("utf-8");
  }

  return null;
};

/**
 * Recursively fetches folder structure from a repository
 * @param repoName - Repository name
 * @param path - Path within the repository (default: root)
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to folder structure object or null
 */
export const fetchFolderStructure = async (
  repoName: string,
  path = "",
  owner: string,
  ref = "HEAD",
): Promise<JsonObject | null> => {
  if (env.NODE_ENV === "test") {
    const fixture = getTestRepository(repoName, owner);
    if (!fixture) return null;

    const structure = buildTestFolderStructure(fixture, owner, ref);
    if (!path) {
      return structure;
    }

    const segments = path.split("/").filter(Boolean);
    let current: JsonValue = structure;
    for (const segment of segments) {
      if (!isRecord(current)) {
        return null;
      }
      current = current[segment];
      if (current === undefined) {
        return null;
      }
    }

    return isRecord(current) ? (current as JsonObject) : null;
  }

  try {
    const data = await fetchGitHubAPI(
      `/repos/${owner}/${repoName}/git/trees/${encodeURIComponent(ref)}?recursive=1`
    );

    if (!isValidGitHubResponse(data) || !isRecord(data)) {
      return null;
    }

    const treeResponse = data as GitHubTreeResponse;
    if (!isArray(treeResponse.tree)) {
      return null;
    }

    const structure: JsonObject = {};
    for (const item of treeResponse.tree) {
      const treeItem = item as GitHubTreeItem;
      if (treeItem.type !== "blob") {
        continue;
      }

      assignNestedPath(
        structure,
        treeItem.path,
        createGitHubBlobUrl(owner, repoName, ref, treeItem.path),
      );
    }

    if (treeResponse.truncated) {
      log("warn", "GitHub tree response truncated", {
        repoName,
        owner,
        ref,
      });
    }

    if (!path) {
      return structure;
    }

    const segments = path.split("/").filter(Boolean);
    let current: JsonValue = structure;
    for (const segment of segments) {
      if (!isRecord(current)) {
        return null;
      }
      current = current[segment];
      if (current === undefined) {
        return null;
      }
    }

    return isRecord(current) ? (current as JsonObject) : null;
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      throw error;
    }
    log("error", "Error in fetchFolderStructure", {
      repoName,
      path,
      owner,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches and parses package.json from a repository
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to package dependencies or null
 */
export const getPackageDetails = async (
  repoName: string,
  owner: string,
): Promise<{
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} | null> => {
  const packageJsonContent = await fetchFileContent(repoName, "package.json", owner);

  if (!packageJsonContent) {
    return null;
  }

  try {
    const packageJson = JSON.parse(packageJsonContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
    };
  } catch (error) {
    log("error", "Error parsing package.json", {
      repoName,
      owner,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches README content from a repository
 * Tries common README filenames in order
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to README content or null
 */
export const fetchReadme = async (repoName: string, owner: string): Promise<string | null> => {
  if (env.NODE_ENV === "test") {
    const fixture = getTestRepository(repoName, owner);
    return fixture?.readme ?? null;
  }

  const readmeFiles = ["README.md", "README.txt", "README", "readme.md", "readme.txt", "readme"];

  for (const filename of readmeFiles) {
    const content = await fetchFileContent(repoName, filename, owner, false);
    if (content && typeof content === "string" && !content.startsWith("http")) {
      return content;
    }
  }
  return null;
};

/**
 * Fetches language statistics for a repository
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to language statistics object or null
 */
export const fetchRepositoryLanguages = async (
  repoName: string,
  owner: string,
): Promise<Record<string, number> | null> => {
  if (env.NODE_ENV === "test") {
    const fixture = getTestRepository(repoName, owner);
    return fixture?.languages ?? null;
  }

  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/languages`);

  if (!isValidGitHubResponse(data) || !isRecord(data)) {
    return null;
  }

  return data as Record<string, number>;
};

/**
 * Fetches commit activity statistics for a repository
 * Note: GitHub may return 202 Accepted if stats are being calculated
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to commit activity array or null
 */
export const fetchCommitActivity = async (
  repoName: string,
  owner: string,
): Promise<JsonValue[] | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/stats/commit_activity`);

  if (!isValidGitHubResponse(data)) {
    return null;
  }

  return isArray(data) ? data : null;
};

/**
 * Fetches contributor statistics for a repository
 * Note: GitHub may return 202 Accepted if stats are being calculated
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to contributor stats array or null
 */
export const fetchContributorStats = async (
  repoName: string,
  owner: string,
): Promise<JsonValue[] | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/stats/contributors`);

  if (!isValidGitHubResponse(data)) {
    return null;
  }

  return isArray(data) ? data : null;
};

/**
 * Fetches code frequency statistics (additions/deletions per week)
 * Note: GitHub may return 202 Accepted if stats are being calculated
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to code frequency array or null
 */
export const fetchCodeFrequency = async (
  repoName: string,
  owner: string,
): Promise<number[][] | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/stats/code_frequency`);

  if (!isValidGitHubResponse(data)) {
    return null;
  }

  return isArray(data) ? (data as number[][]) : null;
};

/**
 * Fetches participation statistics (all commits vs owner commits)
 * Note: GitHub may return 202 Accepted if stats are being calculated
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to participation stats or null
 */
export const fetchParticipation = async (
  repoName: string,
  owner: string,
): Promise<{ all: number[]; owner: number[] } | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/stats/participation`);

  if (!isValidGitHubResponse(data) || !isRecord(data)) {
    return null;
  }

  return data as { all: number[]; owner: number[] };
};

/**
 * Fetches releases for a repository
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @param perPage - Number of releases to fetch (default: 10)
 * @returns Promise that resolves to releases array or null
 */
export const fetchReleases = async (
  repoName: string,
  owner: string,
  perPage = 10,
): Promise<JsonValue[] | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/releases?per_page=${perPage}`);

  if (!isValidGitHubResponse(data)) {
    return null;
  }

  return isArray(data) ? data : null;
};

/**
 * Fetches GitHub Actions workflows for a repository
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to workflows array or null
 */
export const fetchWorkflows = async (
  repoName: string,
  owner: string,
): Promise<JsonObject[] | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/actions/workflows`);

  if (!isValidGitHubResponse(data) || !isRecord(data)) {
    return null;
  }

  if ("workflows" in data && isArray(data.workflows)) {
    return data.workflows as JsonObject[];
  }

  return null;
};

type WorkflowRun = {
  id: number;
  name: string;
  head_branch: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  workflow_id: number;
};

/**
 * Fetches workflow runs for a repository
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @param perPage - Number of runs to fetch (default: 10)
 * @returns Promise that resolves to workflow runs object or null
 */
export const fetchWorkflowRuns = async (
  repoName: string,
  owner: string,
  perPage = 10,
): Promise<{ total_count: number; workflow_runs: WorkflowRun[] } | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/actions/runs?per_page=${perPage}`);

  if (!isValidGitHubResponse(data) || !isRecord(data)) {
    return null;
  }

  if ("workflow_runs" in data && isArray(data.workflow_runs)) {
    const runs = data.workflow_runs as WorkflowRun[];
    return {
      total_count: (data.total_count as number) ?? runs.length,
      workflow_runs: runs.map((run) => ({
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
};

/**
 * Fetches the latest CI/CD status for a repository
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @returns Promise that resolves to CI/CD status or null
 */
export const fetchCICDStatus = async (
  repoName: string,
  owner: string,
): Promise<{
  status: string;
  conclusion: string | null;
  name: string;
  branch: string;
  created_at: string;
  updated_at: string;
  html_url: string;
} | null> => {
  const workflowRuns = await fetchWorkflowRuns(repoName, owner, 1);
  if (!workflowRuns || !workflowRuns.workflow_runs || workflowRuns.workflow_runs.length === 0) {
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
};

type DeploymentStatus = {
  state: string;
  description: string | null;
  environment: string;
  created_at: string;
  target_url: string | null;
};

type Deployment = {
  id: number;
  ref: string;
  sha: string;
  task: string;
  environment: string;
  description: string | null;
  creator: string;
  created_at: string;
  updated_at: string;
  statuses: DeploymentStatus[];
};

/**
 * Fetches deployments for a repository with their statuses
 * @param repoName - Repository name
 * @param owner - Repository owner (username or organization)
 * @param perPage - Number of deployments to fetch (default: 10)
 * @returns Promise that resolves to deployments array with statuses or null
 */
export const fetchDeployments = async (
  repoName: string,
  owner: string,
  perPage = 10,
): Promise<Deployment[] | null> => {
  if (env.NODE_ENV === "test") {
    const fixture = getTestRepository(repoName, owner);
    if (!fixture) return null;
    return fixture.deployments.slice(0, perPage) as Deployment[];
  }

  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/deployments?per_page=${perPage}`);

  if (!isValidGitHubResponse(data)) {
    return null;
  }

  if (!isArray(data)) {
    return null;
  }

  const deploymentsWithStatuses = await Promise.all(
    data.map(async (deployment: JsonValue) => {
      const dep = deployment as {
        id: number;
        ref: string;
        sha: string;
        task: string;
        environment: string;
        description: string | null;
        creator: { login: string };
        created_at: string;
        updated_at: string;
      };

      const statusesData = await fetchGitHubAPI(
        `/repos/${owner}/${repoName}/deployments/${dep.id}/statuses`,
      );
      const statuses =
        isValidGitHubResponse(statusesData) && isArray(statusesData)
          ? (statusesData as DeploymentStatus[])
          : null;

      return {
        id: dep.id,
        ref: dep.ref,
        sha: dep.sha,
        task: dep.task,
        environment: dep.environment,
        description: dep.description,
        creator: dep.creator.login,
        created_at: dep.created_at,
        updated_at: dep.updated_at,
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
    }),
  );

  return deploymentsWithStatuses;
};
