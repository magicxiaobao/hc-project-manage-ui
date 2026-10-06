import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { PermissionResponse } from "../../../lib/api/system-types";
import { useAuthStore } from "../../../lib/api/auth-store";
import { PermissionFormDialog } from "../permission-form-dialog";
import { PermissionListLive } from "../permission-list-live";

// SSR 使用 store 当前快照；Zustand 默认的服务器初始快照固定为未登录。
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
  detail: {
    data: undefined as PermissionResponse | undefined,
    isError: false,
    isFetching: false,
    isRefetching: false,
    error: null as unknown,
    dataUpdatedAt: 0,
    refetch: vi.fn(),
  },
  list: {
    data: [] as PermissionResponse[] | undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  guard: vi.fn(),
}));
vi.mock("@/lib/query", async (original) => ({
  ...(await original<typeof import("../../../lib/query")>()),
  usePermissionDetail: () => mocks.detail,
  usePermissionListAll: () => mocks.list,
}));
vi.mock("@/components/biz", async () => {
  const shared = await import("../../biz/form-guard");
  const select = await import("../../biz/option-select");
  return {
    ...shared,
    ...select,
    AppModal: ({
      open,
      children,
      title,
    }: {
      open: boolean;
      children: ReactNode;
      title: ReactNode;
    }) =>
      open ? (
        <section data-modal="true" aria-label={typeof title === "string" ? title : undefined}>
          {children}
        </section>
      ) : null,
    useUnsavedChangesGuard: (dirty: boolean) => {
      mocks.guard(dirty);
      return {
        guard: vi.fn(),
        markClean: vi.fn(),
        blocker: <span data-blocker="true" />,
        dialog: <span data-discard="true" />,
      };
    },
  };
});
const originalAuth = useAuthStore.getState();
const clients: QueryClient[] = [];
function render(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: "1",
      userName: "测试",
      cnName: null,
      extraInfo: {},
      roles: [],
      authorities: ["system:admin"],
    },
  });
  mocks.detail.isError = false;
  mocks.detail.error = null;
  mocks.detail.data = undefined;
  mocks.list.data = [];
  mocks.list.isLoading = false;
  mocks.list.isError = false;
  mocks.list.error = null;
  mocks.guard.mockClear();
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.setState(originalAuth);
  vi.restoreAllMocks();
});
const row = (id: number): PermissionResponse => ({
  id,
  permissionName: `权限${id}`,
  permissionCode: `code:${id}`,
  permissionType: "CUSTOM",
  groupName: null,
  description: null,
  enabled: null,
  createdAt: null,
  updatedAt: 1767225600,
});

describe("权限点静态呈现（不代替浏览器交互）", () => {
  it("新建三个必填标签、真实下拉 aria-label 含必填；默认启用", () => {
    const html = render(<PermissionFormDialog open permissionId={null} onClose={vi.fn()} />);
    expect(html.match(/class="sr-only">（必填）/g)).toHaveLength(3);
    expect(html.match(/aria-hidden="true" class="text-danger">\*/g)).toHaveLength(3);
    expect(html).toContain('aria-label="权限类型（必填）"');
    expect(html).toContain('aria-label="是否启用"');
    expect(html).toContain('role="switch" checked=""');
    expect(html).toContain("权限编码须全局唯一，禁用后仍占用该编码");
  });
  it.each(["loading", "error", "closed"])("%s 分支 blocker/discard 独立挂载", (state) => {
    mocks.detail.isError = state === "error";
    mocks.detail.error = new Error("详情失败");
    const html = render(
      <PermissionFormDialog open={state !== "closed"} permissionId={11} onClose={vi.fn()} />,
    );
    expect(html).toContain('data-blocker="true"');
    expect(html).toContain('data-discard="true"');
    if (state === "closed") expect(html).not.toContain("data-modal");
    else expect(html.indexOf("data-blocker")).toBeLessThan(html.indexOf("data-modal"));
    if (state === "loading") {
      expect(html).toContain("正在加载权限信息");
      expect(html).not.toContain('aria-label="权限名称"');
    }
    if (state === "error") {
      expect(html).toContain("加载失败：详情失败");
      expect(html).toContain("重试");
    }
  });
  it("八列、未知类型、null字段和秒级时间正确；持续挂载表单守卫", () => {
    mocks.list.data = [row(1)];
    const html = render(<PermissionListLive />);
    for (const title of [
      "权限名称",
      "权限编码",
      "权限类型",
      "所属分组",
      "描述",
      "状态",
      "更新时间",
      "操作",
    ])
      expect(html).toContain(`>${title}</th>`);
    expect(html).toContain("CUSTOM");
    expect(html).toContain("未分组");
    expect(html).toContain("未设置");
    expect(html).toContain("2026");
    expect(html).toContain("共 1 个权限点");
    expect(html).toContain('data-blocker="true"');
    expect(html).not.toContain('type="checkbox"');
  });
  it("首次加载与真实空数据分别呈现", () => {
    mocks.list.isLoading = true;
    mocks.list.data = undefined;
    expect(render(<PermissionListLive />)).toContain("正在加载权限点");
    mocks.list.isLoading = false;
    mocks.list.data = [];
    expect(render(<PermissionListLive />)).toContain("暂无权限点");
  });
  it("后台重取失败保留旧行并明确未更新", () => {
    mocks.list.data = [row(1)];
    mocks.list.isError = true;
    mocks.list.error = new Error("失败");
    const html = render(<PermissionListLive />);
    expect(html).toContain("后台刷新失败，当前数据未更新");
    expect(html).toContain("code:1");
    expect(html).toContain('role="alert"');
  });
  it("非管理员兜底没有变更入口", () => {
    useAuthStore.setState({ isAuthenticated: false });
    const html = render(<PermissionListLive />);
    expect(html).toContain("需要系统管理员权限");
    expect(html).not.toContain("新增权限点");
  });
});
