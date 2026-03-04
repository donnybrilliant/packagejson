/**
 * Test fixtures and mock data
 */

export const testRepos = [
  {
    name: "test-repo",
    full_name: "test-owner/test-repo",
    owner: { login: "test-owner" },
  },
];

export const testFilesData = {
  "test-repo": {
    "package.json": '{"name": "test"}',
    src: {
      "index.ts": "export default {};",
    },
  },
};

export const testPackageData = {
  dependencies: { test: "1.0.0" },
  devDependencies: { "@types/test": "1.0.0" },
};

export const testNpmPackage = {
  name: "elysia",
  description: "stub package (test env)",
  version: "1.0.0",
  exists: true,
};

