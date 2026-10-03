import { isItemPath, readItemOrigin } from "./navigation.ts";

export type SidebarModule =
  | "dashboard" | "stats" | "board" | "backlog" | "sprints" | "issues"
  | "requirements" | "trace" | "gantt" | "dependencies" | "defects"
  | "tests" | "releases" | "assignment" | "worklogs" | "settings";

const SEGMENTS: Record<string, SidebarModule> = {
  dashboard: "dashboard", stats: "stats", backlog: "backlog", sprints: "sprints",
  issues: "issues", requirements: "requirements", trace: "trace", gantt: "gantt",
  dependencies: "dependencies", defects: "defects", tests: "tests", releases: "releases",
  assignment: "assignment", worklogs: "worklogs", settings: "settings",
};

function barePath(value: string): string {
  const path = value.split(/[?#]/)[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function moduleFromProjectPath(pathname: string, projectKey: string): SidebarModule | undefined {
  const path = barePath(pathname);
  const root = `/p/${projectKey}`;
  if (path === root) return "board";
  if (!path.startsWith(`${root}/`)) return undefined;
  return SEGMENTS[path.slice(root.length + 1)];
}

export function highlightedModule(pathname: string, projectKey: string, origin: unknown): SidebarModule | undefined {
  if (isItemPath(pathname)) {
    const href = readItemOrigin(origin)?.href;
    return (href && moduleFromProjectPath(href, projectKey)) || "issues";
  }
  return moduleFromProjectPath(pathname, projectKey);
}

export function moduleDestination(module: SidebarModule, projectKey: string): string {
  return module === "board" ? `/p/${projectKey}` : `/p/${projectKey}/${module}`;
}

export function projectLayoutRemountKey(params: { projectKey: string }): string {
  return params.projectKey;
}
