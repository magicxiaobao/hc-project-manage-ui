import type { FileRoutesByFullPath } from "@/routeTree.gen";

type PagePath = keyof FileRoutesByFullPath;
export interface PagePolicy {
  route: PagePath;
  title: string;
  policy: "menu" | "authenticated";
  aliases?: readonly string[];
  inherits?: PagePath;
  available?: boolean;
}
/** Finite page policy; layout routes do not confer permission on descendants. */
export const routeManifest: readonly PagePolicy[] = [
  { route: "/me", title: "个人资料", policy: "authenticated" },
  { route: "/inbox", title: "收件箱", policy: "authenticated" },
  { route: "/projects", title: "项目", policy: "menu" },
  { route: "/projects/new", title: "新建项目", policy: "menu", inherits: "/projects" },
  { route: "/sys/users/", title: "用户管理", policy: "menu", aliases: ["/system/user"] },
  { route: "/sys/users/new", title: "新增用户", policy: "menu", inherits: "/sys/users/" },
  { route: "/sys/users/$userId/", title: "编辑用户", policy: "menu", inherits: "/sys/users/" },
  { route: "/sys/users/$userId/roles", title: "分配角色", policy: "menu", inherits: "/sys/users/" },
  { route: "/sys/roles/", title: "角色管理", policy: "menu", aliases: ["/system/role"] },
  {
    route: "/sys/roles/$roleId/permissions",
    title: "分配权限",
    policy: "menu",
    inherits: "/sys/roles/",
  },
  {
    route: "/sys/dictionaries/",
    title: "字典管理",
    policy: "menu",
    aliases: ["/system/dictionary"],
  },
  { route: "/sys/configs/", title: "系统配置管理", policy: "menu", aliases: ["/system/config"] },
  { route: "/sys/menus/", title: "菜单管理", policy: "menu", aliases: ["/system/menu"] },
  {
    route: "/sys/permissions/",
    title: "权限管理",
    policy: "menu",
    aliases: ["/system/permission"],
  },
  { route: "/sys/workflow-designer", title: "工作流设计器", policy: "menu", aliases: ["/system/workflow-designer"] },
  { route: "/sys/profile", title: "个人中心", policy: "menu" },
  { route: "/p/$projectKey/", title: "项目详情", policy: "menu", inherits: "/projects" },
  {
    route: "/p/$projectKey/requirements/",
    title: "需求",
    policy: "menu",
    aliases: ["/requirements"],
  },
  {
    route: "/p/$projectKey/requirements/$requirementId",
    title: "需求详情",
    policy: "menu",
    inherits: "/p/$projectKey/requirements/",
  },
  { route: "/p/$projectKey/issues/", title: "任务", policy: "menu", aliases: ["/issues"] },
  {
    route: "/p/$projectKey/issues/new",
    title: "新增任务",
    policy: "menu",
    inherits: "/p/$projectKey/issues/",
  },
  {
    route: "/p/$projectKey/issues/$taskId",
    title: "任务详情",
    policy: "menu",
    inherits: "/p/$projectKey/issues/",
  },
  { route: "/p/$projectKey/trace", title: "追溯", policy: "menu", aliases: ["/trace"] },
  { route: "/p/$projectKey/boards", title: "看板", policy: "menu" },
  { route: "/p/$projectKey/versions", title: "版本", policy: "menu" },
  { route: "/p/$projectKey/testcases", title: "测试用例", policy: "menu" },
  { route: "/p/$projectKey/testsuites", title: "测试套件", policy: "menu" },
  { route: "/p/$projectKey/release-environments", title: "发布环境", policy: "menu" },
  { route: "/p/$projectKey/traceability", title: "追溯矩阵", policy: "menu" },
  {
    route: "/p/$projectKey/boards/$boardId",
    title: "看板详情",
    policy: "menu",
    inherits: "/p/$projectKey/boards",
  },
  {
    route: "/p/$projectKey/versions/$versionId",
    title: "版本详情",
    policy: "menu",
    inherits: "/p/$projectKey/versions",
  },
  {
    route: "/p/$projectKey/testcases/$testCaseId",
    title: "测试用例详情",
    policy: "menu",
    inherits: "/p/$projectKey/testcases",
  },
  {
    route: "/p/$projectKey/testsuites/$testSuiteId",
    title: "测试套件详情",
    policy: "menu",
    inherits: "/p/$projectKey/testsuites",
  },
  {
    route: "/p/$projectKey/defects/$defectId",
    title: "缺陷详情",
    policy: "menu",
    inherits: "/p/$projectKey/defects",
  },
  {
    route: "/p/$projectKey/defects/board",
    title: "缺陷看板",
    policy: "menu",
    inherits: "/p/$projectKey/defects",
  },
  {
    route: "/p/$projectKey/sprints/$sprintId",
    title: "冲刺详情",
    policy: "menu",
    inherits: "/p/$projectKey/sprints",
  },
  {
    route: "/p/$projectKey/releases/$releaseId",
    title: "发布详情",
    policy: "menu",
    inherits: "/p/$projectKey/releases",
  },
  {
    route: "/p/$projectKey/tests/$testRunId",
    title: "测试执行详情",
    policy: "menu",
    inherits: "/p/$projectKey/tests",
  },
  // Modules with live backend implementations use menu authorization; demo-only modules remain unavailable.
  ...(
    [
      "backlog",
      "defects",
      "dependencies",
      "gantt",
      "releases",
      "sprints",
      "tests",
    ] as const
  ).map((name): PagePolicy => ({
    route: `/p/$projectKey/${name}`,
    title: name,
    policy: "menu",
  })),
  ...(["assignment", "dashboard", "settings", "stats", "worklogs"] as const).map((name): PagePolicy => ({
    route: `/p/$projectKey/${name}`,
    title: name,
    policy: "menu",
    available: false,
  })),
  { route: "/p/$projectKey/items/$itemKey", title: "演示事项", policy: "menu", available: false },
];
export interface PageMapping {
  page: PagePolicy;
  constraints: Readonly<Record<string, string>>;
}
export interface PageMatch {
  page: PagePolicy;
  params: Record<string, string>;
}
const unsafeCharacters = (value: string) =>
  /[\\\s]/.test(value) ||
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export function normalizeInternalPath(value: string): string | null {
  const path = value.split(/[?#]/, 1)[0];
  if (
    !path.startsWith("/") ||
    unsafeCharacters(path) ||
    path.includes("//") ||
    /%(?:2f|5c)/i.test(path)
  )
    return null;
  try {
    if (
      path.split("/").some((s) => {
        const decoded = decodeURIComponent(s);
        return [".", ".."].includes(decoded) || unsafeCharacters(decoded);
      })
    )
      return null;
    return path === "/" ? path : path.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
const segments = (s: string) => (normalizeInternalPath(s) ?? "").split("/").filter(Boolean);
const sortedPages = [...routeManifest].sort((a, b) => {
  const score = (p: PagePolicy) =>
    segments(p.route).reduce((s, part) => s + (part.startsWith("$") ? 1 : 10), 0);
  return score(b) - score(a);
});
function parse(pattern: string, path: string, templates: boolean): Record<string, string> | null {
  const keys = segments(pattern),
    values = segments(path);
  if (keys.length !== values.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i],
      value = values[i];
    if (!key.startsWith("$")) {
      if (key !== value) return null;
    } else if (templates && (value === key || value === `:${key.slice(1)}`)) continue;
    else {
      if (value.startsWith("$") || value.startsWith(":")) return null;
      try {
        params[key.slice(1)] = decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return params;
}
export function matchPage(path: string): PageMatch | null {
  if (!normalizeInternalPath(path)) return null;
  for (const page of sortedPages) {
    const params = parse(page.route, path, false);
    if (params) return { page, params };
  }
  return null;
}
/** Aliases configure a page; they never create a second live URL. uri is not consulted. */
export function mapMenuPath(path: string): PageMapping | null {
  const normalized = normalizeInternalPath(path);
  if (!normalized) return null;
  for (const page of sortedPages) {
    if (page.aliases?.includes(normalized)) return { page, constraints: {} };
    const constraints = parse(page.route, normalized, true);
    if (constraints) return { page, constraints };
  }
  return null;
}
export function bindMapping(
  mapping: PageMapping,
  params: Readonly<Record<string, string>> = {},
): string | null {
  if (
    Object.entries(mapping.constraints).some(
      ([key, value]) => params[key] !== undefined && params[key] !== value,
    )
  )
    return null;
  const values = { ...params, ...mapping.constraints };
  let missing = false;
  const path = mapping.page.route.replace(/\$([A-Za-z][A-Za-z0-9]*)/g, (_, key: string) => {
    if (!values[key]) {
      missing = true;
      return "";
    }
    return encodeURIComponent(values[key]);
  });
  return missing ? null : normalizeInternalPath(path);
}
export function constraintsMatch(
  mapping: PageMapping,
  params: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(mapping.constraints).every(([key, value]) => params[key] === value);
}
