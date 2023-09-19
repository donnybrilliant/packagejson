import NodeCache from "node-cache";

function createCacheManager(ttlSeconds) {
  const cache = new NodeCache({
    stdTTL: ttlSeconds,
    checkperiod: ttlSeconds * 0.2,
  });

  return {
    get(key) {
      return cache.get(key);
    },
    set(key, value) {
      return cache.set(key, value);
    },
    del(key) {
      return cache.del(key);
    },
    flush() {
      return cache.flushAll();
    },
  };
}

const oneWeekInSeconds = 7 * 24 * 60 * 60;
const oneMonthInSeconds = 4 * oneWeekInSeconds;

export const packageJsonCache = createCacheManager(oneWeekInSeconds);
export const filesCache = createCacheManager(oneMonthInSeconds);
