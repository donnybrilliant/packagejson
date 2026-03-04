import { describe, expect, test } from "bun:test";
import { getFileAtPath } from "@/services/files";

describe("Files service helpers", () => {
  const filesData = {
    "repo-one": {
      "package.json": '{"name":"repo-one"}',
      src: {
        "index.ts": "export default {};",
      },
      "docs/readme.md": "hello docs",
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
});
