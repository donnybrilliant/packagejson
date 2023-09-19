let cacheStore = {};

export function getCachedData(key) {
  return cacheStore[key]?.data;
}

export function setCachedData(key, data) {
  if (cacheStore[key]) {
    cacheStore[key].data = data;
    cacheStore[key].lastFetchTimestamp = Date.now();
  } else {
    cacheStore[key] = { data, lastFetchTimestamp: Date.now() };
  }
}

export function isCacheValid(key, cacheTime) {
  return (
    cacheStore[key] &&
    Date.now() - cacheStore[key].lastFetchTimestamp < cacheTime
  );
}

export function invalidateCache(key) {
  if (cacheStore[key]) {
    cacheStore[key].data = null;
    cacheStore[key].lastFetchTimestamp = null;
  }
}
