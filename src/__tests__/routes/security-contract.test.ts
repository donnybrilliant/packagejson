import { describe, expect, test } from "bun:test";

const decoder = new TextDecoder();

describe("Security contract (full app)", () => {
  test("enforces auth on protected routes when auth is enabled via env", () => {
    const script = `
      import { createApp } from "./src/index";

      const app = await createApp();
      const unauthorized = await app.handle(new Request("http://localhost/repos"));
      const authorized = await app.handle(
        new Request("http://localhost/repos", {
          headers: { authorization: "Bearer contract-key" }
        })
      );
      const preflight = await app.handle(
        new Request("http://localhost/repos", {
          method: "OPTIONS",
          headers: {
            origin: "https://portfolio.example.com",
            "access-control-request-method": "GET"
          }
        })
      );

      console.log("unauthorized=" + unauthorized.status);
      console.log("authorized=" + authorized.status);
      console.log("preflight=" + preflight.status);
      process.exit(0);
    `;

    const run = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: process.cwd(),
      env: {
        ...Bun.env,
        NODE_ENV: "test",
        API_KEYS: "contract-key",
        API_KEY_REQUIRED: "true",
        RATE_LIMIT_ENABLED: "false",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = decoder.decode(run.stdout);
    const stderr = decoder.decode(run.stderr);

    expect(run.exitCode).toBe(0);
    expect(stderr).not.toContain("API key auth is required, but no API keys were configured");
    expect(stdout).toContain("unauthorized=401");
    expect(stdout).toContain("authorized=200");
    expect(stdout).toContain("preflight=204");
  });
});
