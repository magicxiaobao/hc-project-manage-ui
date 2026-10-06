import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { MenuResponse } from "../../../lib/api/system-types";
import { useAuthStore } from "../../../lib/api/auth-store";
import { buildMenuTree } from "../../../lib/menu-tree";
import { MenuTree } from "../menu-tree";
import { MenuListLive } from "../menu-list-live";
import { MenuFormDialog } from "../menu-form-dialog";
import { MenuParentSelect } from "../menu-parent-select";
vi.mock("../../../lib/api/auth-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/api/auth-store")>();
  return {
    ...original,
    useAuthStore: Object.assign(
      (selector: (state: ReturnType<typeof original.useAuthStore.getState>) => unknown) =>
        selector(original.useAuthStore.getState()),
      original.useAuthStore,
    ),
  };
});
const mocks = vi.hoisted(() => ({
  roots: {
    data: [] as MenuResponse[] | undefined,
    isError: false,
    isLoading: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  list: {
    data: [] as MenuResponse[] | undefined,
    isError: false,
    isLoading: false,
    isFetching: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  detail: {
    data: undefined as MenuResponse | undefined,
    isError: false,
    error: null as unknown,
    isFetching: false,
    isRefetching: false,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
  },
  preview: {
    data: undefined as MenuResponse[] | undefined,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  },
}));
vi.mock("@/lib/query", async (original) => ({
  ...(await original<typeof import("../../../lib/query")>()),
  useMenuTree: () => mocks.roots,
  useMenuListAll: () => mocks.list,
  useMenuDetail: () => mocks.detail,
  useMenuTreeByUser: () => mocks.preview,
}));
vi.mock("@/components/biz", async () => ({
  ...(await import("../../biz/form-guard")),
  ...(await import("../../biz/option-select")),
  AppModal: ({ open, children, title }: { open: boolean; children: ReactNode; title: string }) =>
    open ? (
      <section data-modal="true" aria-label={title}>
        {children}
      </section>
    ) : null,
  useUnsavedChangesGuard: () => ({
    guard: vi.fn(),
    markClean: vi.fn(),
    blocker: <span data-blocker="true" />,
    dialog: <span data-discard="true" />,
  }),
}));
const original = useAuthStore.getState();
const clients: QueryClient[] = [];
const row = (id: number, parentId = 0, type = 2): MenuResponse => ({
  id,
  parentId,
  name: `菜单${id}`,
  type,
  path: null,
  icon: null,
  openType: 1,
  uri: null,
  permission: null,
  sort: 0,
  keepAlive: false,
  hidden: true,
  memo: null,
  createdAt: null,
  updatedAt: null,
});
function render(node: ReactNode) {
  const c = new QueryClient();
  clients.push(c);
  return renderToStaticMarkup(<QueryClientProvider client={c}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: "1",
      userName: "管理员",
      cnName: null,
      roles: [],
      extraInfo: {},
      authorities: ["system:admin"],
    },
  });
  mocks.roots.data = [row(1)];
  mocks.list.data = [row(1), row(2, 1), row(3, 2, 3), row(4)];
  mocks.roots.isError = false;
  mocks.list.isError = false;
  mocks.detail.isError = false;
  mocks.preview.data = undefined;
  mocks.roots.isLoading = false;
  mocks.list.isLoading = false;
});
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  useAuthStore.setState(original);
  vi.restoreAllMocks();
});
describe("菜单展示", () => {
  it("真实树表默认折叠、展开到三级，叶子无展开按钮；aria-expanded 明确", () => {
    const nodes = buildMenuTree(mocks.list.data!, mocks.roots.data!).roots;
    const collapsed = render(<MenuTree nodes={nodes} expanded={new Set()} onToggle={() => {}} />);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain("菜单2");
    const expanded = render(
      <MenuTree nodes={nodes} expanded={new Set([1, 2])} onToggle={() => {}} />,
    );
    expect(expanded).toContain("菜单3");
    expect(expanded).toContain("padding-left:48px");
    expect(expanded).not.toContain('aria-label="展开菜单3');
  });
  it("两动作都显示，不根据 hidden 推断状态，不出现删除", () => {
    const markup = render(<MenuListLive />);
    expect(markup).toContain("菜单4");
    expect(markup).toContain("启用");
    expect(markup).toContain("禁用");
    expect(markup).not.toContain("删除");
    expect(markup).not.toContain("<th>状态");
  });
  it("任一来源失败不将部分结果展示为完整树", () => {
    mocks.list.data = undefined;
    mocks.list.isError = true;
    mocks.list.error = new Error("失败");
    const markup = render(<MenuListLive />);
    expect(markup).toContain("完整菜单结构加载失败");
    expect(markup).not.toContain('aria-label="菜单管理树"');
  });
  it("孤儿/循环记录可见并提示，用户结果仅展示接口记录，无管理树后代", () => {
    mocks.list.data = [row(1), row(2, 1), row(4, 99)];
    mocks.preview.data = [row(20)];
    const markup = render(<MenuListLive />);
    expect(markup).toContain("菜单关系异常");
    expect(markup).toContain("菜单4");
    expect(markup).toContain("当前返回结果尚未按用户权限过滤");
    const preview = markup.slice(markup.indexOf('aria-label="用户菜单结果"'));
    expect(preview).toContain("菜单20");
    expect(preview).not.toContain("菜单2<");
  });
  it("未授权页面没有编辑控件", () => {
    useAuthStore.setState({ isAuthenticated: false });
    expect(render(<MenuListLive />)).toBe('<p class="p-6">需要系统管理员权限</p>');
  });
  it("新建两个 RequiredMark，name/type required 可读；guard 在 AppModal 外独立存在", () => {
    const markup = render(
      <MenuFormDialog
        open
        menuId={null}
        tree={buildMenuTree([], [])}
        records={[]}
        parentsReady
        onClose={() => {}}
      />,
    );
    expect((markup.match(/（必填）/g) ?? []).length).toBe(3); // type control label plus two RequiredMark texts
    expect(markup).toContain('aria-required="true"');
    expect(markup).toContain('aria-label="菜单类型（必填）"');
    expect(markup.indexOf('data-blocker="true"')).toBeLessThan(markup.indexOf('data-modal="true"'));
  });
  it("详情失败分支仍挂 blocker/discard，不出现保存", () => {
    mocks.detail.isError = true;
    mocks.detail.error = new Error("ID 不匹配");
    const markup = render(
      <MenuFormDialog
        open
        menuId={8}
        tree={buildMenuTree([], [])}
        records={[]}
        parentsReady
        onClose={() => {}}
      />,
    );
    expect(markup).toContain("加载失败");
    expect(markup).toContain('data-blocker="true"');
    expect(markup).toContain('data-discard="true"');
    expect(markup).not.toContain(">保存<");
  });
  it("失效父级可读，不悄悄选择顶级；字段报错在对应控件下方", () => {
    const markup = render(
      <MenuParentSelect
        value={99}
        options={[{ id: "0", label: "顶级菜单" }]}
        ready
        busy={false}
        error="父级不可选"
        onChange={() => {}}
      />,
    );
    expect(markup).toContain("原父级 #99 不可选");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("父级不可选");
  });
});
