/** Fixture API facts, actual mutation + access-refresh + button snapshot subscription. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { useAssignRolePermissions } from "../../query/hooks/useRolePermissions";
import { setAccessQueryClient, refreshAccess } from "../../access/service";
import {
  getButtonPermissionSnapshot,
  subscribeButtonPermissions,
} from "../../access/button-permissions";
import { canUseButton } from "../../access/use-button-permissions";
import { resetAccess } from "../../access/store";
import { getSessionGeneration, useAuthStore } from "../../api/auth-store";
import { authApi } from "../../api/auth";
import { systemApi } from "../../api/system";
import { fixtureMenu } from "./fixtures";
const original = useAuthStore.getState();
let client: QueryClient;
let ids: number[];
const user = () => ({
  userId: "7",
  userName: "fixture",
  cnName: null,
  extraInfo: {},
  roles: ["ADMIN"],
  authorities: [
    "system:admin",
    ...ids.map((id) => (id === 91 ? "fixture:create" : "fixture:edit")),
  ],
});
beforeEach(() => {
  ids = [91, 92];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  setAccessQueryClient(client);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  useAuthStore.setState({
    ...original,
    user: user(),
    isAuthenticated: true,
    token: "fixture-only",
  });
  resetAccess("7", getSessionGeneration());
  vi.spyOn(authApi, "getCurrentUser").mockImplementation(async () => user());
  vi.spyOn(systemApi.menu, "getMenuTreeByUser").mockResolvedValue([
    fixtureMenu("fixture:create", 1),
    fixtureMenu("fixture:edit", 2),
  ]);
  vi.spyOn(systemApi.role, "assignPermissions").mockImplementation(async (payload) => {
    ids = [...payload.permissionIds];
    return "权限分配成功";
  });
});
afterEach(() => {
  resetAccess(null, getSessionGeneration());
  setAccessQueryClient(null);
  client.clear();
  useAuthStore.setState(original);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mutation() {
  let result!: ReturnType<typeof useAssignRolePermissions>;
  function Probe() {
    result = useAssignRolePermissions();
    return null;
  }
  renderToString(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  return result;
}
it("successful saves refresh the exact same subscribed consumer; drafts and failures do not authorize", async () => {
  await refreshAccess({ queryClient: client });
  const notifications: { status: string; granted: boolean }[] = [];
  const off = subscribeButtonPermissions(() => {
    const s = getButtonPermissionSnapshot();
    notifications.push({ status: s.status, granted: canUseButton(s, "fixture:create") });
  });
  try {
    // Unsaved draft is page-local and does not publish a button permission snapshot.
    const draft = [92];
    expect(canUseButton(getButtonPermissionSnapshot(), "fixture:create")).toBe(true);
    expect(notifications).toEqual([]);
    const save = mutation();
    vi.mocked(systemApi.role.assignPermissions).mockRejectedValueOnce(Error("save failed"));
    const before = getButtonPermissionSnapshot();
    await expect(save.mutateAsync({ roleId: 12, permissionIds: draft })).rejects.toThrow(
      "save failed",
    );
    expect(getButtonPermissionSnapshot()).toBe(before);
    expect(notifications).toEqual([]);
    await save.mutateAsync({ roleId: 12, permissionIds: draft });
    await vi.waitFor(() => expect(getButtonPermissionSnapshot().status).toBe("ready"));
    expect(canUseButton(getButtonPermissionSnapshot(), "fixture:create")).toBe(false);
    expect(canUseButton(getButtonPermissionSnapshot(), "fixture:edit")).toBe(true);
    expect(notifications).toEqual([
      { status: "loading", granted: false },
      { status: "ready", granted: false },
    ]);
    await save.mutateAsync({ roleId: 12, permissionIds: [91, 92] });
    await vi.waitFor(() => expect(getButtonPermissionSnapshot().status).toBe("ready"));
    expect(canUseButton(getButtonPermissionSnapshot(), "fixture:create")).toBe(true);
    expect(notifications.at(-1)).toEqual({ status: "ready", granted: true });
    await save.mutateAsync({ roleId: 12, permissionIds: [] });
    await vi.waitFor(() => expect(getButtonPermissionSnapshot().status).toBe("ready"));
    expect(getButtonPermissionSnapshot().grantedCodes.size).toBe(0); // system:admin + ADMIN confer none
    expect(authApi.getCurrentUser).toHaveBeenCalledTimes(4);
    expect(systemApi.menu.getMenuTreeByUser).toHaveBeenCalledTimes(4);
  } finally {
    off();
  }
});
