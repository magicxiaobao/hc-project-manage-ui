import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoleResponse } from "@/lib/api/system-types";
import { UserRolesDialog } from "../user-roles-dialog";
import { DictionaryHookHarness, nodes, button } from "./dictionary-hook-harness";

const mocks = vi.hoisted(() => ({
  full: { data: [] as RoleResponse[], dataUpdatedAt: 1 },
  search: { data: [] as RoleResponse[], dataUpdatedAt: 2 },
  assigned: [] as RoleResponse[],
  save: vi.fn(),
}));
vi.mock("react", async (load) => {
  const original = await load<typeof import("react")>();
  const { DictionaryHookHarness: H } = await import("./dictionary-hook-harness");
  return {
    ...original,
    useState: ((initial: unknown) => H.active!.state(initial)) as typeof original.useState,
    useRef: ((initial: unknown) => H.active!.ref(initial)) as typeof original.useRef,
    useEffect: ((callback, deps) => H.active!.effect(callback, deps)) as typeof original.useEffect,
  };
});
vi.mock("@/components/biz", () => ({
  AppModal: () => null,
  EmptyHint: () => null,
  FilterCheckbox: () => null,
  useUnsavedChangesGuard: () => ({ guard: (action: () => void) => action(), markClean: vi.fn() }),
}));
vi.mock("@/lib/query", () => ({
  useUserDetail: () => ({ data: { username: "admin" } }),
  useUserRoles: () => ({ data: mocks.assigned }),
  useRoleOptions: (keyword: string) => (keyword ? mocks.search : mocks.full),
  useAssignUserRoles: () => ({ isPending: false, mutateAsync: mocks.save }),
  toUserMessage: (error: unknown) => String(error),
}));
const role = (id: number, enabled = true): RoleResponse => ({
  id,
  enabled,
  roleName: `角色${id}`,
  roleCode: `ROLE_${id}`,
  description: null,
  createdAt: null,
  updatedAt: null,
});
let harness: DictionaryHookHarness;
beforeEach(() => {
  mocks.full.data = [role(1), role(2)];
  mocks.search.data = [role(1), role(2, false), role(9, false)];
  mocks.assigned = [role(9, false)];
  mocks.save.mockReset().mockResolvedValue("ok");
  harness = new DictionaryHookHarness();
  harness.render(() => UserRolesDialog({ open: true, userId: 7, onClose() {} }));
});
afterEach(() => harness.unmount());
const checkbox = (id: number) =>
  nodes(harness.tree).find((node) => node.props.label === `角色${id}`)?.props;
const search = () => {
  const input = nodes(harness.tree).find((node) => node.props["aria-label"] === "搜索角色")!;
  (input.props.onChange as (event: { target: { value: string } }) => void)({
    target: { value: "角色" },
  });
  harness.render();
  button(harness.tree, "搜索").onPress();
  harness.render();
};
const save = async () => {
  button(harness.tree, "保存").onPress();
  for (let i = 0; i < 4; i++) await Promise.resolve();
  harness.render();
};

it("禁用非 kept 搜索结果不渲染；kept 只读勾选且保存自动保留", async () => {
  search();
  expect(checkbox(2)).toBeUndefined();
  expect(checkbox(9)).toMatchObject({ checked: true, isDisabled: true });
  (checkbox(9)!.onChange as () => void)();
  (checkbox(1)!.onChange as () => void)();
  harness.render();
  await save();
  expect(mocks.save).toHaveBeenCalledWith({ userId: 7, roleIds: [1, 9] });
});

it("已选择角色在搜索中变为禁用，保存排除残留选择并保留 kept", async () => {
  (checkbox(2)!.onChange as () => void)();
  harness.render();
  expect(checkbox(2)!.checked).toBe(true);
  search();
  expect(checkbox(2)).toBeUndefined();
  await save();
  expect(mocks.save).toHaveBeenCalledWith({ userId: 7, roleIds: [9] });
});
