import { getRepositories, getPackageDetails } from "./api.js";
import { packageJsonCache } from "../utils/cache.js";

export async function fetchAggregatedData() {
  try {
    const repos = await getRepositories("all");
    const aggregatedData = {
      dependencies: {},
      devDependencies: {},
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

    packageJsonCache.set("packageData", aggregatedData);
    return aggregatedData;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
