import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfilePage } from "../profile-page";
import {
  DictionaryHookHarness,
  button,
  change,
  deferred,
  nodes,
  textOf,
} from "./dictionary-hook-harness";

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  success: vi.fn(),
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
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null, isPending: true }),
  useQueryClient: () => ({}),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/api/auth-store", () => ({
  useAuthStore: () => ({ userId: "7", userName: "admin" }),
  hasSystemAdmin: () => true,
}));
vi.mock("@/lib/api/system", () => ({
  systemApi: { user: { changePassword: mocks.changePassword } },
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("@/components/biz", () => ({
  FieldError: () => null,
  PageHeading: () => null,
  RequiredMark: () => null,
  useUnsavedChangesGuard: () => ({ guard: (action: () => void) => action(), markClean: vi.fn() }),
}));

let harness: DictionaryHookHarness;
beforeEach(() => {
  mocks.changePassword.mockReset();
  mocks.success.mockReset();
  harness = new DictionaryHookHarness();
  harness.render(() => ProfilePage());
});
afterEach(() => harness.unmount());

const fill = () => {
  change(harness.tree, "原密码（必填）", "oldpass99");
  change(harness.tree, "新密码（必填）", "newpass99");
  change(harness.tree, "确认新密码（必填）", "newpass99");
  harness.render();
};
const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
  harness.render();
};

it("state 提交前连点改密只发送一次请求，成功后清空表单且可再次提交", async () => {
  const pending = deferred<string>();
  mocks.changePassword.mockReturnValueOnce(pending.promise);
  fill();
  const submit = button(harness.tree, "修改密码").onPress;
  submit();
  submit();
  expect(mocks.changePassword).toHaveBeenCalledTimes(1);
  expect(mocks.changePassword).toHaveBeenCalledWith({
    id: 7,
    oldPassword: "oldpass99",
    newPassword: "newpass99",
  });
  harness.render();
  expect(button(harness.tree, "提交中…").isDisabled).toBe(true);

  pending.resolve("ok");
  await flush();
  expect(mocks.success).toHaveBeenCalledTimes(1);
  for (const label of ["原密码（必填）", "新密码（必填）", "确认新密码（必填）"]) {
    const field = nodes(harness.tree).find((node) => node.props["aria-label"] === label)!;
    expect(field.props.value).toBe("");
  }
  fill();
  mocks.changePassword.mockResolvedValueOnce("ok");
  button(harness.tree, "修改密码").onPress();
  await flush();
  expect(mocks.changePassword).toHaveBeenCalledTimes(2);
});

it("改密失败后解除同步提交锁，允许重试", async () => {
  mocks.changePassword.mockRejectedValueOnce(new Error("network"));
  fill();
  button(harness.tree, "修改密码").onPress();
  await flush();
  expect(mocks.success).not.toHaveBeenCalled();
  expect(nodes(harness.tree).some((node) => node.props.role === "alert" && textOf(node))).toBe(true);
  expect(button(harness.tree, "修改密码").isDisabled).toBe(false);
  mocks.changePassword.mockResolvedValueOnce("ok");
  button(harness.tree, "修改密码").onPress();
  await flush();
  expect(mocks.changePassword).toHaveBeenCalledTimes(2);
  expect(mocks.success).toHaveBeenCalledTimes(1);
});
