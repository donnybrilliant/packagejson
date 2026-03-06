import { describe, expect, test } from "bun:test";
import { coerce, compare, gt, lt, semver, usingBuiltinSemver } from "@/semver";

describe("semver helpers", () => {
  test("coerce strips range operators and preserves semantic version", () => {
    expect(coerce("^1.2.3")).toBe("1.2.3");
    expect(coerce("~2.0.0-beta.1")).toBe("2.0.0-beta.1");
  });

  test("coerce builds version from numeric segments when needed", () => {
    expect(coerce("release 3 4 5")).toBe("3.4.5");
  });

  test("coerce returns null for non-version input", () => {
    expect(coerce("workspace:*")).toBeNull();
    expect(coerce("")).toBeNull();
  });

  test("compare, gt, and lt delegate to Bun semver ordering", () => {
    expect(compare("1.0.0", "1.0.0")).toBe(0);
    expect(compare("1.2.0", "1.1.9")).toBe(1);
    expect(compare("1.1.9", "1.2.0")).toBe(-1);
    expect(gt("2.0.0", "1.9.9")).toBe(true);
    expect(lt("1.9.9", "2.0.0")).toBe(true);
  });

  test("exports the expected adapter shape", () => {
    expect(typeof semver.satisfies).toBe("function");
    expect(typeof semver.compare).toBe("function");
    expect(usingBuiltinSemver).toBe(true);
  });
});
