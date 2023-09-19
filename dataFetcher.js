import { getRepositories, getPackageDetails } from "./api.js";
import { setCachedData } from "./cache.js";

export async function fetchAggregatedData() {
  const repos = await getRepositories();
  const aggregatedData = {
    dependencies: {},
    devDependencies: {},
    timestamp: new Date().toISOString(),
  };

  for (const repo of repos) {
    const packageDetails = await getPackageDetails(repo.name);
    if (packageDetails) {
      aggregatedData.dependencies = {
        ...aggregatedData.dependencies,
        ...packageDetails.dependencies,
      };
      aggregatedData.devDependencies = {
        ...aggregatedData.devDependencies,
        ...packageDetails.devDependencies,
      };
    }
  }

  setCachedData(aggregatedData);
  return aggregatedData;
}
