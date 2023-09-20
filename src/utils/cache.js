import NodeCache from "node-cache";
import { CACHE_SETTINGS } from "../../config/index.js";

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

export const packageJsonCache = createCacheManager(CACHE_SETTINGS.ONE_WEEK);
export const filesCache = createCacheManager(CACHE_SETTINGS.ONE_MONTH);
