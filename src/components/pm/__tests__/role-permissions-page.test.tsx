import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { PermissionResponse } from "@/lib/api/system-types";
import { RolePermissionsPage } from "../role-permissions-page";
import { DictionaryHookHarness, nodes, button, textOf } from "./dictionary-hook-harness";

const mocks = vi.hoisted(() => ({
  permissions: [] as PermissionResponse[],
  assigned: [] as number[],
  assignedUpdatedAt: 1,
  save: vi.fn(),
  refetchAssigned: vi.fn(),
}));
vi.mock("react", async (load) => {
  const original = await load<typeof import("react")>();
  const { DictionaryHookHarness: H } = await import("./dictionary-hook-harness");
  return {
    ...original,
    useState: ((initial: unknown) => H.active!.state(initial)) as typeof original.useState,
    useRef: ((initial: unknown) => H.active!.ref(initial)) as typeof original.useRef,
    useEffect: ((callback, deps) => H.active!.effect(callback, deps)) as typeof original.useEffect,
    useLayoutEffect: ((callback, deps) => H.active!.effect(callback, deps)) as typeof original.useLayoutEffect,
    useMemo: ((callback: () => unknown) => callback()) as typeof original.useMemo,
  };
});
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/api/auth-store", () => ({
  hasSystemAdmin: () => true,
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ isAuthenticated: true, user: { authorities: ["system:admin"] } }),
}));
vi.mock("@/components/biz/form-guard", () => ({
  FieldError: () => null,
  useUnsavedChangesGuard: () => ({ guard: (action: () => void) => action(), markClean: vi.fn() }),
}));
vi.mock("@/lib/query", () => ({
  useRoleOptions: () => ({ data: [{ id: 7, enabled: true }] }),
  usePermissionTree: () => ({
    data: mocks.permissions,
    isSuccess: true,
    refetch: async () => ({ data: mocks.permissions }),
  }),
  useRolePermissions: () => ({
    data: mocks.assigned,
    isSuccess: true,
    dataUpdatedAt: mocks.assignedUpdatedAt,
    refetch: mocks.refetchAssigned,
  }),
  useAssignRolePermissions: () => ({ isPending: false, mutateAsync: mocks.save }),
  toUserMessage: (error: unknown) => String(error),
}));
const permission = (id: number, enabled = true): PermissionResponse => ({
  id, enabled, groupName: "系统", permissionName: `权限${id}`, permissionCode: `sys:${id}`,
  permissionType: "BUTTON", description: null, createdAt: null, updatedAt: null,
});
let harness: DictionaryHookHarness;
beforeEach(() => {
  mocks.permissions = [permission(1), permission(2), permission(3)];
  mocks.assigned = [1, 99];
  mocks.assignedUpdatedAt = 1;
  mocks.save.mockReset().mockImplementation(async ({ permissionIds }: { permissionIds: number[] }) => {
    mocks.assigned = permissionIds;
  });
  mocks.refetchAssigned.mockReset().mockImplementation(async () => ({ data: mocks.assigned }));
  harness = new DictionaryHookHarness();
  harness.render(() => {
    const session = RolePermissionsPage({ roleId: "7" });
    return (session.type as (props: { rawRoleId: string }) => ReactElement)(session.props);
  });
});
afterEach(() => harness.unmount());
const select = (selected: number[]) => {
  const tree = nodes(harness.tree).find((node) => typeof node.props.onSelectionChange === "function")!;
  (tree.props.onSelectionChange as (ids: number[]) => void)(selected);
  harness.render();
};
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  harness.render();
};
const save = async () => {
  button(harness.tree, "保存分配").onPress();
  await settle();
};
const errors = () => nodes(harness.tree).map((node) => node.props.message ?? "").join(" ");

it("新选权限被禁用或删除后不再提交，原有及 hidden 分配保留并提示移除", async () => {
  select([1, 2, 3]);
  mocks.permissions = [permission(1, false), permission(2, false), permission(4)];
  harness.render();
  await save();
  expect(mocks.save).toHaveBeenCalledWith({ roleId: 7, permissionIds: [1, 99] });
  expect(textOf(harness.tree)).toContain("以下权限在编辑期间已失效，已从本次提交中移除：2、3");
});

it.each([{ ids: [1, 2, 99] }, { ids: [1] }, { ids: [] }])("分配内容变为 $ids 时拒绝覆盖旧基线", async ({ ids }) => {
  select([1, 2]);
  mocks.assigned = ids;
  harness.render();
  await save();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(errors()).toContain("该角色的权限分配已在别处变更，请重新加载后再操作");
});

it("同内容后台重取推进时间戳、顺序与重复项变化仍可保存", async () => {
  select([1, 2]);
  mocks.assigned = [99, 1, 1];
  mocks.assignedUpdatedAt = 30_002;
  harness.render();
  await save();
  expect(mocks.save).toHaveBeenCalledWith({ roleId: 7, permissionIds: [1, 2, 99] });
});

it("保存验证 actual 更新基线，下一次编辑可继续保存", async () => {
  select([1, 2]);
  mocks.refetchAssigned.mockImplementation(async () => {
    mocks.assigned = [2, 99];
    return { data: mocks.assigned };
  });
  await save();
  select([2, 3]);
  await save();
  expect(mocks.save).toHaveBeenLastCalledWith({ roleId: 7, permissionIds: [2, 3, 99] });
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

it("重新加载成功更新分配基线后可保存", async () => {
  select([1, 2]);
  mocks.assigned = [3, 99];
  harness.render();
  await save();
  expect(mocks.save).not.toHaveBeenCalled();
  button(harness.tree, "重新加载").onPress();
  await settle();
  select([2, 3]);
  await save();
  expect(mocks.save).toHaveBeenCalledWith({ roleId: 7, permissionIds: [2, 3, 99] });
});
