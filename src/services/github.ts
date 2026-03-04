import { env } from "@/env";
import { getErrorMessage, isArray, isRecord } from "@/utils/errors";
import { handleGitHubResponse, isValidGitHubResponse } from "@/utils/github";
import { log } from "@/utils/logger";

type GitHubRepo = {
  name: string;
  full_name: string;
  owner: { login: string };
};

type GitHubContentItem = {
  name: string;
  type: "file" | "dir";
  path: string;
  size?: number;
  content?: string;
  message?: string;
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

/**
 * Fetches data from the GitHub API
 * @param endpoint - API endpoint (e.g., "/repos/owner/repo")
 * @returns Promise that resolves to the JSON data, error object, or null
 */
export const fetchGitHubAPI = async (endpoint: string): Promise<unknown | null> => {
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
    log("error", "Error in fetchGitHubAPI", {
      endpoint,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetches repositories for the authenticated user
 * @param type - Repository type: "all", "public", or "private" (default: "public")
 * @returns Promise that resolves to an array of repositories or null
 */
export const getRepositories = async (type: string = "public"): Promise<GitHubRepo[] | null> => {
  const data = await fetchGitHubAPI(`/user/repos?type=${type}&per_page=100&sort=updated`);
  return isArray(data) ? (data as GitHubRepo[]) : null;
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
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/contents/${filePath}`);

  if (!isValidGitHubResponse(data) || !isRecord(data)) {
    return null;
  }

  const item = data as GitHubContentItem;
  if (item.message) {
    return null;
  }

  if (alwaysProvideLink || isImage(item) || isVideo(item) || isOtherBinary(item)) {
    return `https://github.com/${owner}/${repoName}/blob/main/${filePath}`;
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
): Promise<Record<string, unknown> | null> => {
  try {
    const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/contents/${path}`);

    if (!isValidGitHubResponse(data)) {
      return null;
    }

    if (!isArray(data)) {
      return null;
    }

    const structure: Record<string, unknown> = {};
    for (const item of data) {
      const contentItem = item as GitHubContentItem;
      if (contentItem.type === "dir") {
        const subStructure = await fetchFolderStructure(repoName, contentItem.path, owner);
        if (subStructure) {
          structure[contentItem.name] = subStructure;
        }
      } else if (contentItem.type === "file") {
        const content = await fetchFileContent(
          repoName,
          contentItem.path,
          owner,
          env.ONLY_SAVE_LINKS,
        );
        if (content) {
          structure[contentItem.name] = content;
        }
      }
    }
    return structure;
  } catch (error) {
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
): Promise<unknown[] | null> => {
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
): Promise<unknown[] | null> => {
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
): Promise<unknown[] | null> => {
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
): Promise<unknown[] | null> => {
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/actions/workflows`);

  if (!isValidGitHubResponse(data) || !isRecord(data)) {
    return null;
  }

  if ("workflows" in data && isArray(data.workflows)) {
    return data.workflows;
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
  const data = await fetchGitHubAPI(`/repos/${owner}/${repoName}/deployments?per_page=${perPage}`);

  if (!isValidGitHubResponse(data)) {
    return null;
  }

  if (!isArray(data)) {
    return null;
  }

  const deploymentsWithStatuses = await Promise.all(
    data.map(async (deployment: unknown) => {
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
