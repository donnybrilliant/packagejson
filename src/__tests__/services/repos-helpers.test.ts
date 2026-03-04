import { describe, expect, test } from "bun:test";
import {
  convertIncludeListToOptions,
  formatBasicRepo,
  paginate,
  parseCommaSeparatedList,
  selectFields,
  sortRepos,
  type GitHubRepo,
} from "@/services/repos";

describe("Repos helper functions", () => {
  test("parseCommaSeparatedList trims values and removes empty segments", () => {
    expect(parseCommaSeparatedList(undefined)).toEqual([]);
    expect(parseCommaSeparatedList(" readme, languages , ,stats ")).toEqual([
      "readme",
      "languages",
      "stats",
    ]);
  });

  test("selectFields returns all fields when field list is empty", () => {
    const source = { name: "demo", stars: 10, archived: false };
    const selected = selectFields(source, []);
    expect(selected).toBe(source);
  });

  test("selectFields only keeps requested existing fields", () => {
    const source = { name: "demo", stars: 10, archived: false };
    const selected = selectFields(source, ["name", "stars", "missing"]);
    expect(selected).toEqual({ name: "demo", stars: 10 });
  });

  test("sortRepos sorts by stars descending", () => {
    const repos = [
      { name: "a", stars: 1 },
      { name: "b", stars: 9 },
      { name: "c", stars: 4 },
    ];
    const sorted = sortRepos(repos, "stars");
    expect(sorted.map((repo) => repo.name)).toEqual(["b", "c", "a"]);
  });

  test("sortRepos sorts by name ascending", () => {
    const repos = [{ name: "zeta" }, { name: "alpha" }, { name: "mid" }];
    const sorted = sortRepos(repos, "name");
    expect(sorted.map((repo) => repo.name)).toEqual(["alpha", "mid", "zeta"]);
  });

  test("sortRepos defaults to updated_at descending", () => {
    const repos = [
      { name: "a", updated_at: "2024-01-01T00:00:00Z" },
      { name: "b", updated_at: "2024-03-01T00:00:00Z" },
      { name: "c", updated_at: "2024-02-01T00:00:00Z" },
    ];
    const sorted = sortRepos(repos, "updated");
    expect(sorted.map((repo) => repo.name)).toEqual(["b", "c", "a"]);
  });

  test("paginate defaults limit to 100 and clamps offset", () => {
    const result = paginate([1, 2, 3, 4, 5], 0, -10);
    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.meta).toEqual({
      total: 5,
      limit: 100,
      offset: 0,
      hasMore: false,
    });
  });

  test("paginate returns expected slice and hasMore metadata", () => {
    const result = paginate([1, 2, 3, 4, 5], 2, 2);
    expect(result.data).toEqual([3, 4]);
    expect(result.meta).toEqual({
      total: 5,
      limit: 2,
      offset: 2,
      hasMore: true,
    });
  });

  test("formatBasicRepo maps core GitHub fields to API response shape", () => {
    const repo: GitHubRepo = {
      name: "demo",
      full_name: "alice/demo",
      description: "Demo repository",
      html_url: "https://github.com/alice/demo",
      homepage: "https://demo.example",
      language: "TypeScript",
      stargazers_count: 42,
      forks_count: 7,
      watchers_count: 9,
      open_issues_count: 3,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-02-01T00:00:00Z",
      pushed_at: "2024-02-02T00:00:00Z",
      topics: ["api", "bun"],
      license: {
        name: "MIT License",
        spdx_id: "MIT",
        url: "https://api.github.com/licenses/mit",
      },
      has_pages: true,
      owner: {
        login: "alice",
        avatar_url: "https://avatars.githubusercontent.com/u/1",
        html_url: "https://github.com/alice",
      },
      private: false,
      archived: false,
      fork: false,
      default_branch: "main",
      size: 123,
      disabled: false,
      deployments_url: "https://api.github.com/repos/alice/demo/deployments",
      releases_url: "https://api.github.com/repos/alice/demo/releases{/id}",
      issues_url: "https://api.github.com/repos/alice/demo/issues{/number}",
      pulls_url: "https://api.github.com/repos/alice/demo/pulls{/number}",
    };

    const formatted = formatBasicRepo(repo);
    expect(formatted).toMatchObject({
      name: "demo",
      full_name: "alice/demo",
      stars: 42,
      forks: 7,
      watchers: 9,
      open_issues: 3,
      has_pages: true,
      pages_url: "https://alice.github.io/demo",
      owner: {
        login: "alice",
      },
      license: {
        name: "MIT License",
        spdx_id: "MIT",
      },
    });
  });

  test("convertIncludeListToOptions enables only requested flags", () => {
    const options = convertIncludeListToOptions([
      "readme",
      "languages",
      "cicd",
      "deployment-links",
    ]);

    expect(options).toEqual({
      includeReadme: true,
      includeLanguages: true,
      includeStats: false,
      includeReleases: false,
      includeWorkflows: false,
      includeCICD: true,
      includeDeployments: false,
      includeNpm: false,
      includeDeploymentLinks: true,
    });
  });
});
