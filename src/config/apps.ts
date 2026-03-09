export interface AppConfig {
  name: string;
  repos: string[];
  color?: string;
}

const apps: AppConfig[] = [
  {
    name: "Odys Front",
    repos: ["ODYS-TRAVEL/odys-front"],
    color: "#00D4FF",
  },
  {
    name: "Onboarding Odys",
    repos: ["ODYS-TRAVEL/odys-front", "ODYS-TRAVEL/onboarding"],
    color: "#9A84FF",
  },
];

export default apps;

/**
 * Maps GitHub repo full_name to local filesystem path.
 */
export const repoLocalPaths: Record<string, string> = {
  "ODYS-TRAVEL/odys-front": "/Users/weberludovic/Documents/Lab/Evaneos/odys-front",
  "ODYS-TRAVEL/onboarding": "/Users/weberludovic/Documents/Lab/Evaneos/onboarding",
};

export function getLocalPath(repoFullName: string): string | undefined {
  return repoLocalPaths[repoFullName];
}

export function getAppsForRepo(repoFullName: string): string[] {
  const matched = apps
    .filter((app) => app.repos.includes(repoFullName))
    .map((app) => app.name);
  return matched.length > 0 ? matched : [repoFullName.split("/")[1] ?? repoFullName];
}

export function getAllApps(repoFullNames: string[]): string[] {
  const appSet = new Set<string>();
  for (const repo of repoFullNames) {
    for (const app of getAppsForRepo(repo)) {
      appSet.add(app);
    }
  }
  return Array.from(appSet).sort();
}

export function getReposForApp(appName: string): string[] {
  const app = apps.find((a) => a.name === appName);
  return app ? app.repos : [];
}

export function getAppColor(appName: string): string | undefined {
  return apps.find((a) => a.name === appName)?.color;
}
