let cachedData = null;
let lastFetchTimestamp = null;

const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export function getCachedData() {
  return cachedData;
}

export function setCachedData(data) {
  cachedData = data;
  lastFetchTimestamp = Date.now();
}

export function isCacheValid() {
  return (
    cachedData !== null &&
    lastFetchTimestamp !== null &&
    Date.now() - lastFetchTimestamp < ONE_WEEK_IN_MS
  );
}

export function invalidateCache() {
  cachedData = null;
  lastFetchTimestamp = null;
}
