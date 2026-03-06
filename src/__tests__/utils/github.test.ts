import { describe, expect, test } from "bun:test";
import {
  handleGitHubResponse,
  isValidGitHubResponse,
  GitHubRateLimitError,
} from "@/utils/github";

describe("GitHub response utilities", () => {
  test("handleGitHubResponse throws GitHubRateLimitError for 403 rate-limit responses", async () => {
    const response = new Response(JSON.stringify({ message: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });

    await expect(
      handleGitHubResponse(response, "/repos/test/repo")
    ).rejects.toThrow(GitHubRateLimitError);
  });

  test("handleGitHubResponse returns null for 202 stats-pending responses", async () => {
    const response = new Response(JSON.stringify({ message: "Accepted" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });

    const result = await handleGitHubResponse(response, "/repos/test/repo/stats");
    expect(result).toBeNull();
  });

  test("handleGitHubResponse returns GitHub error payload for 404 responses", async () => {
    const response = new Response(JSON.stringify({ message: "Not Found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });

    const result = await handleGitHubResponse(response, "/repos/test/missing");
    expect(result).toEqual({ message: "Not Found" });
  });

  test("handleGitHubResponse returns null for non-ok non-404 responses", async () => {
    const response = new Response(JSON.stringify({ message: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

    const result = await handleGitHubResponse(response, "/repos/test/repo");
    expect(result).toBeNull();
  });

  test("handleGitHubResponse returns parsed payload for success responses", async () => {
    const payload = [{ name: "repo-one" }];
    const response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const result = await handleGitHubResponse(response, "/user/repos");
    expect(result).toEqual(payload);
  });

  test("isValidGitHubResponse filters null and GitHub error payloads", () => {
    expect(isValidGitHubResponse(null)).toBe(false);
    expect(isValidGitHubResponse({ message: "Not Found" })).toBe(false);
    expect(isValidGitHubResponse({ id: 1, name: "repo" })).toBe(true);
    expect(isValidGitHubResponse([{ id: 1 }])).toBe(true);
  });
});
