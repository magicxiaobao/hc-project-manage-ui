import { afterEach, expect, it, vi } from "vitest";
import { canUseButton } from "../use-button-permissions";
import { getButtonPermissionSnapshot, subscribeButtonPermissions } from "../button-permissions";
import { getAccessSnapshot, publishAccess, resetAccess } from "../store";
import { publishFixture } from "../../buttons/__tests__/fixtures";
afterEach(() => resetAccess(null, 0));
it("only ready exact codes with a user authorize; no role/admin/authority fallback", () => {
  publishFixture();
  expect(canUseButton(getButtonPermissionSnapshot(), "fixture:create")).toBe(true);
  for (const code of [
    "",
    " ",
    "Fixture:create",
    "fixture:",
    "fixture:*",
    " fixture:create ",
    "unknown",
  ])
    expect(canUseButton(getButtonPermissionSnapshot(), code)).toBe(false);
  for (const facts of [
    { authorities: [] },
    { authorities: ["system:admin"] },
    { authorities: [], roles: ["ADMIN"] },
    { codes: [] },
  ]) {
    publishFixture(facts);
    expect(canUseButton(getButtonPermissionSnapshot(), "fixture:create")).toBe(false);
  }
  publishFixture();
  publishAccess({ ...getAccessSnapshot(), userId: null });
  expect(canUseButton(getButtonPermissionSnapshot(), "fixture:create")).toBe(false);
});
it("subscribes to same revision state changes, and unsubscribes", () => {
  publishFixture();
  const revision = getAccessSnapshot().revision;
  const states: boolean[] = [];
  const off = subscribeButtonPermissions(() =>
    states.push(canUseButton(getButtonPermissionSnapshot(), "fixture:create")),
  );
  for (const status of ["loading", "ready", "error", "idle"] as const) {
    publishAccess({ ...getAccessSnapshot(), status });
    expect(getAccessSnapshot().revision).toBe(revision);
  }
  expect(states).toEqual([false, true, false, false]);
  off();
  publishFixture();
  expect(states).toHaveLength(4);
});

it("validates nonblank codes without normalizing exact granted strings", () => {
  publishFixture({ codes: [" fixture:create "] });
  const snapshot = getButtonPermissionSnapshot();
  expect(canUseButton(snapshot, " fixture:create ")).toBe(true);
  expect(canUseButton(snapshot, "fixture:create")).toBe(false);
  expect(canUseButton(snapshot, null as never)).toBe(false);
  expect(canUseButton(snapshot, undefined as never)).toBe(false);
});
it("registration and permission reads have no network effects", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  try {
    publishFixture();
    const off = subscribeButtonPermissions(() => getButtonPermissionSnapshot());
    expect(canUseButton(getButtonPermissionSnapshot(), "fixture:create")).toBe(true);
    publishFixture({ authorities: [] });
    off();
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
