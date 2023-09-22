import NodeCache from "node-cache";
import { CACHE_SETTINGS } from "../../config/index.js";

/**
 * Creates and returns a cache manager instance with the given TTL (time-to-live) settings.
 *
 * @param {number} ttlSeconds - The time-to-live duration for cached items in seconds.
 * @returns {Object} A cache manager with methods to get, set, delete, and flush cached items.
 */
function createCacheManager(ttlSeconds) {
  const cache = new NodeCache({
    stdTTL: ttlSeconds,
    checkperiod: ttlSeconds * 0.2,
  });

  return {
    /**
     * Retrieves the value associated with the given key from the cache.
     *
     * @param {string} key - The key to retrieve the value for.
     * @returns {*} The value associated with the key, or `undefined` if not found.
     */
    get(key) {
      return cache.get(key);
    },

    /**
     * Sets a value in the cache associated with the given key.
     *
     * @param {string} key - The key to associate the value with.
     * @param {*} value - The value to cache.
     * @returns {boolean} `true` if the value was successfully set, otherwise `false`.
     */
    set(key, value) {
      return cache.set(key, value);
    },

    /**
     * Deletes the value associated with the given key from the cache.
     *
     * @param {string} key - The key to delete the value for.
     * @returns {number} The count of deleted entries (0 or 1).
     */
    del(key) {
      return cache.del(key);
    },

    /**
     * Clears the entire cache.
     *
     * @returns {void}
     */
    flush() {
      return cache.flushAll();
    },
  };
}

/**
 * Cache for package JSON data with a TTL of one week.
 * @type {Object}
 */
export const packageJsonCache = createCacheManager(CACHE_SETTINGS.ONE_WEEK);

/**
 * Cache for file data with a TTL of one month.
 * @type {Object}
 */
export const filesCache = createCacheManager(CACHE_SETTINGS.ONE_MONTH);
