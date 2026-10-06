import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { deriveSnapshot, type AccessSnapshot } from "@/lib/access/snapshot";
import type { MenuResponse } from "@/lib/api/system-types";
import { breadcrumbTrail, MenuBreadcrumbs } from "@/components/biz/menu-breadcrumbs";
import {
  PermissionNavigation,
  projectNavigation,
  systemNavigation,
} from "@/components/biz/permission-navigation";

const menu = (id: number, extra: Partial<MenuResponse> = {}): MenuResponse => ({
  id,
  parentId: null,
  name: `菜单${id}`,
  type: 2,
  icon: "unknown",
  path: null,
  openType: 1,
  uri: null,
  permission: "view",
  sort: 0,
  hidden: false,
  keepAlive: null,
  memo: null,
  createdAt: null,
  updatedAt: null,
  ...extra,
});
const tree = [
  menu(1, { type: 1, name: "系统", permission: null }),
  menu(2, { parentId: 1, name: "用户管理", path: "/sys/users" }),
  menu(3, { parentId: 2, type: 3, name: "新增按钮", path: "/sys/users/new", permission: "button" }),
  menu(4, { parentId: 1, name: "隐藏菜单", path: "/sys/menus", hidden: true }),
  menu(5, { name: "需求", path: "/p/$projectKey/requirements" }),
  menu(6, { name: "HC 任务", path: "/p/HC/issues" }),
  menu(7, { name: "外部文档", path: "https://example.com/docs", openType: 3 }),
  menu(8, { type: 1, name: "空目录", permission: null }),
];
const ready = (records = tree, authorities = ["view"]): AccessSnapshot => ({
  ...deriveSnapshot(
    { userId: "7", userName: "u", cnName: null, extraInfo: {}, roles: [], authorities },
    records,
  ),
  userId: "7",
  sessionGeneration: 1,
  revision: 1,
  status: "ready",
  fetchedAt: 1,
  error: null,
});
function render(children: React.ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute().addChildren([]),
    history: createMemoryHistory(),
  });
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>{children}</RouterContextProvider>,
  );
}
describe("权限导航和面包屑（同一快照）", () => {
  it.each([
    ["el-icon-user", "user"],
    ["el-user", "user"],
    ["icon-user", "user"],
    ["user", "user"],
    ["unknown", "list"],
  ])("菜单图标 %s 渲染为 %s", (icon, expected) => {
    const nodes = ready([menu(1, { path: "/sys/users", icon })]).visibleNavigation;
    const html = render(<PermissionNavigation nodes={nodes} pathname="/sys/users" />);
    expect(html).toContain(`lucide-${expected}`);
  });

  it("系统导航不含按钮、隐藏项、空分组或项目入口；外链安全打开", () => {
    const nodes = systemNavigation(ready().visibleNavigation);
    const html = render(<PermissionNavigation nodes={nodes} pathname="/sys/users" />);
    expect(html).toContain("用户管理");
    expect(html).toContain('aria-current="page"');
    for (const hidden of ["新增按钮", "隐藏菜单", "空目录", "HC 任务", "需求"])
      expect(html).not.toContain(hidden);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("项目导航绑定真实 URL 参数，不以首个项目代填或扩大固定 HC 授权", () => {
    const snapshot = ready();
    const hc = render(
      <PermissionNavigation
        nodes={projectNavigation(snapshot.visibleNavigation, "HC")}
        pathname="/p/HC/issues"
        params={{ projectKey: "HC" }}
      />,
    );
    expect(hc).toContain("/p/HC/requirements");
    expect(hc).toContain("/p/HC/issues");
    const other = render(
      <PermissionNavigation
        nodes={projectNavigation(snapshot.visibleNavigation, "OTHER")}
        pathname="/p/OTHER/requirements"
        params={{ projectKey: "OTHER" }}
      />,
    );
    expect(other).toContain("/p/OTHER/requirements");
    expect(other).not.toContain("HC 任务");
    expect(other).not.toContain("/p/HC/");
  });
  it("继承详情页追加静态标题；无路径目录文本，末项不可点击", () => {
    const trail = breadcrumbTrail(ready(), "/sys/users/123/roles");
    expect(trail).toEqual([
      { label: "系统", href: null },
      { label: "用户管理", href: "/sys/users" },
      { label: "分配角色", href: null },
    ]);
    const html = render(<MenuBreadcrumbs snapshot={ready()} pathname="/sys/users/123/roles" />);
    expect(html).toContain('aria-label="面包屑"');
    expect(html).toContain('aria-current="page"');
  });
  it("独立隐藏页面采用自身链；隐藏祖先不点击，不泄露无权候选名称", () => {
    const records = [
      ...tree,
      menu(9, { parentId: 4, path: "/sys/users/123/roles", name: "独立角色页面", hidden: true }),
      menu(10, { path: "/sys/users/123/roles", name: "未授权名称", permission: "missing" }),
    ];
    const trail = breadcrumbTrail(ready(records), "/sys/users/123/roles");
    expect(trail.at(-1)).toEqual({ label: "独立角色页面", href: null });
    expect(trail.find((crumb) => crumb.label === "隐藏菜单")?.href).toBeNull();
    expect(JSON.stringify(trail)).not.toContain("未授权名称");
  });
  it("刷新和撤销立即清空导航与面包屑", () => {
    const snapshot = ready(tree, []);
    expect(breadcrumbTrail(snapshot, "/sys/users")).toEqual([]);
    expect(
      render(
        <PermissionNavigation
          nodes={systemNavigation(snapshot.visibleNavigation)}
          pathname="/sys/users"
        />,
      ),
    ).toContain("暂无可访问菜单");
    expect(breadcrumbTrail({ ...ready(), status: "loading" }, "/sys/users")).toEqual([]);
  });
});
