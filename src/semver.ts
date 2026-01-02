const builtin = Bun.semver;

if (!builtin || !builtin.satisfies || !builtin.order) {
  throw new Error("Bun.semver is unavailable in this runtime");
}

const compare = (a: string, b: string) => builtin.order(a, b);
const gt = (a: string, b: string) => builtin.order(a, b) === 1;
const lt = (a: string, b: string) => builtin.order(a, b) === -1;

export const semver = {
  satisfies: builtin.satisfies,
  compare,
  gt,
  lt,
};

export const usingBuiltinSemver = true;
