// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { RoleResponse } from "@/lib/api/system-types";
import { RoleListLive } from "../role-list-live";

const mocks = vi.hoisted(() => ({ roles: [] as RoleResponse[] }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/api/auth-store", () => ({
  hasSystemAdmin: () => true,
  useAuthStore: (selector: (state: { isAuthenticated: boolean; user: { authorities: string[] } }) => unknown) =>
    selector({ isAuthenticated: true, user: { authorities: ["system:admin"] } }),
}));
vi.mock("@/lib/query", async (load) => ({
  ...(await load<typeof import("@/lib/query")>()),
  useRoleListAll: () => ({ data: mocks.roles, isLoading: false, isError: false }),
  useValidRole: () => ({ isPending: false, mutate: vi.fn() }),
  useInvalidRole: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/components/pm/role-form-dialog", () => ({ RoleFormDialog: () => null }));
vi.mock("@/components/biz", () => ({
  PageHeading: ({ title }: { title: string }) => <h1>{title}</h1>,
  EmptyHint: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  RegisteredButtons: () => null,
  AppModal: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? <section role="dialog" aria-label={title}>{children}</section> : null,
}));
afterEach(cleanup);

describe("角色列表状态及切换操作", () => {
  it.each([
    { enabled: null, label: "未知", action: null },
    { enabled: true, label: "启用", action: "禁用" },
    { enabled: false, label: "禁用", action: "启用" },
  ])("enabled=$enabled 显示 $label 并保留对应操作", ({ enabled, label, action }) => {
    mocks.roles = [{
      id: 7,
      roleName: "测试角色",
      roleCode: "test-role",
      description: null,
      enabled,
      createdAt: null,
      updatedAt: null,
    }];
    render(<RoleListLive />);
    const row = within(screen.getByRole("row", { name: /测试角色/ }));
    expect(row.getAllByRole("cell")[3].textContent).toBe(label);
    if (action === null) {
      expect(row.queryByRole("button", { name: "启用" })).toBeNull();
      expect(row.queryByRole("button", { name: "禁用" })).toBeNull();
    } else {
      const button = row.getByRole("button", { name: action });
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(row.queryByRole("button", { name: label })).toBeNull();
      fireEvent.click(button);
      expect(screen.getByRole("dialog", { name: `${action}角色` })).toBeTruthy();
      expect(screen.getByRole("button", { name: `确定${action}` })).toBeTruthy();
    }
  });
});
