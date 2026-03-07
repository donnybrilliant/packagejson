import { describe, expect, test } from "bun:test";
import { getFileAtPath, resolveFilesDataFromDataStore } from "@/services/files";

describe("Files service helpers", () => {
  const filesData = {
    "repo-one": {
      "package.json": '{"name":"repo-one"}',
      src: {
        "index.ts": "export default {};",
      },
      docs: {
        "readme.md": "hello docs",
      },
    },
  };

  test("returns the full data object for empty path", () => {
    expect(getFileAtPath(filesData, [])).toEqual(filesData);
  });

  test("returns nested object for directory path", () => {
    const result = getFileAtPath(filesData, ["repo-one", "src"]);
    expect(result).toEqual({ "index.ts": "export default {};" });
  });

  test("returns nested file content for file path", () => {
    const result = getFileAtPath(filesData, ["repo-one", "package.json"]);
    expect(result).toBe('{"name":"repo-one"}');
  });

  test("decodes URL-encoded path segments", () => {
    const result = getFileAtPath(filesData, ["repo-one", "docs%2Freadme.md"]);
    expect(result).toBe("hello docs");
  });

  test("returns null for missing paths", () => {
    const result = getFileAtPath(filesData, ["repo-one", "missing"]);
    expect(result).toBeNull();
  });

  test("returns null when attempting to traverse into a non-object", () => {
    const result = getFileAtPath(filesData, [
      "repo-one",
      "package.json",
      "subpath",
    ]);
    expect(result).toBeNull();
  });

  test("resolves VFS from namespaced data.json.vfs", () => {
    const resolved = resolveFilesDataFromDataStore({
      cache: {
        files: { value: { ignored: true } },
      },
      vfs: filesData,
    });

    expect(resolved).toEqual(filesData);
  });

  test("falls back to legacy root VFS shape when vfs namespace is absent", () => {
    const legacyData = {
      "repo-legacy": {
        "README.md": "legacy readme",
      },
    };

    const resolved = resolveFilesDataFromDataStore(legacyData);
    expect(resolved).toEqual(legacyData);
  });

  test("returns null when store only contains namespaces without VFS payload", () => {
    const resolved = resolveFilesDataFromDataStore({
      cache: {
        files: { value: {} },
      },
    });

    expect(resolved).toBeNull();
  });

  test("returns null for stale legacy package payload keys", () => {
    const resolved = resolveFilesDataFromDataStore({
      deploymentPlatforms: {},
      "packageData-max": {},
    });

    expect(resolved).toBeNull();
  });

  test("normalizes legacy flat keys (e.g. docs/readme.md) so getFileAtPath can traverse", () => {
    const flatLegacy = {
      "repo-flat": {
        "package.json": "{}",
        "docs/readme.md": "hello from flat",
        "src/index.ts": "export {};",
      },
    };

    const resolved = resolveFilesDataFromDataStore(flatLegacy);
    expect(resolved).not.toBeNull();
    if (!resolved) throw new Error("expected resolved to be non-null");

    expect(getFileAtPath(resolved, ["repo-flat", "package.json"])).toBe("{}");
    expect(getFileAtPath(resolved, ["repo-flat", "docs", "readme.md"])).toBe(
      "hello from flat"
    );
    expect(getFileAtPath(resolved, ["repo-flat", "src", "index.ts"])).toBe(
      "export {};"
    );
  });
});
