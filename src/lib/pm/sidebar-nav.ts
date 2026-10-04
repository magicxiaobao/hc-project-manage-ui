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
  // Codex review 4175510489：嵌套路由（/p/<key>/issues/123、/issues/new、
  // /requirements/123 等）整体不在 SEGMENTS 里——取首段判定，让详情/新建页
  // 高亮归属的父模块；未知首段仍返回 undefined。
  return SEGMENTS[path.slice(root.length + 1).split("/")[0]];
}

export function highlightedModule(pathname: string, projectKey: string, origin: unknown): SidebarModule | undefined {
  if (isItemPath(pathname)) {
    const href = readItemOrigin(origin)?.href;
    return (href && moduleFromProjectPath(href, projectKey)) || "issues";
  }
  return moduleFromProjectPath(pathname, projectKey);
}

/**
 * Codex review 4175472566：登录态下从 URL 提取当前项目键。
 * 演示项目的项目从 usePm().projects 查到时走完整演示导航；查不到（真实后
 * 端项目）但路径是 /p/<key>/... 时，走仅含真实后端模块（项目首页/需求/
 * 任务/追溯）的精简导航，而不是退回通用分支。
 */
export function projectKeyFromPath(pathname: string): string | null {
  const match = /^\/p\/([^/?#]+)/.exec(barePath(pathname));
  return match ? match[1] : null;
}

export function moduleDestination(module: SidebarModule, projectKey: string): string {
  return module === "board" ? `/p/${projectKey}` : `/p/${projectKey}/${module}`;
}

export function projectLayoutRemountKey(params: { projectKey: string }): string {
  return params.projectKey;
}

export function chosenProjectKey(
  chosen: string,
  projects: readonly { key: string }[],
  currentKey: string,
): string {
  return projects.some((entry) => entry.key === chosen) ? chosen : currentKey;
}
