const builtin = Bun.semver;

if (!builtin || !builtin.satisfies || !builtin.order) {
  throw new Error("Bun.semver is unavailable in this runtime");
}

const compare = (a: string, b: string) => builtin.order(a, b);
const gt = (a: string, b: string) => builtin.order(a, b) === 1;
const lt = (a: string, b: string) => builtin.order(a, b) === -1;

// Coerce version string to a valid semver (extract version from ranges like ^1.0.0, ~2.0.0, etc.)
const coerce = (version: string): string | null => {
  if (!version || typeof version !== "string") return null;

  // Remove range prefixes (^, ~, >=, <=, >, <, =)
  const cleaned = version.replace(/^[\^~>=<]+\s*/, "").trim();

  // Extract version pattern (major.minor.patch with optional pre-release/build)
  const match = cleaned.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+([\w.-]+))?/
  );
  if (match) {
    return match[0]; // Return the matched version string
  }

  // Try to extract just numbers if pattern doesn't match
  const numbers = cleaned.match(/\d+/g);
  if (numbers && numbers.length >= 3) {
    return `${numbers[0]}.${numbers[1]}.${numbers[2]}`;
  }

  return null;
};

export const semver = {
  satisfies: builtin.satisfies,
  compare,
  gt,
  lt,
  coerce,
};

export { compare, coerce, gt, lt };

export const usingBuiltinSemver = true;
