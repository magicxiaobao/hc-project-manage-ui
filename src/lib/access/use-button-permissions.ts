import { useSyncExternalStore } from "react";
import {
  getButtonPermissionSnapshot,
  subscribeButtonPermissions,
  type ButtonPermissionSnapshot,
} from "./button-permissions";

/** Exact authorization only; role names and administrator status confer no shortcut. */
export function canUseButton(snapshot: ButtonPermissionSnapshot, code: string): boolean {
  return (
    typeof code === "string" &&
    code.trim().length > 0 &&
    snapshot.status === "ready" &&
    snapshot.userId !== null &&
    snapshot.grantedCodes.has(code)
  );
}

export type ButtonSession = Pick<ButtonPermissionSnapshot, "userId" | "sessionGeneration">;

export function isButtonSession(
  snapshot: ButtonPermissionSnapshot,
  session: ButtonSession,
): boolean {
  return (
    snapshot.userId === session.userId && snapshot.sessionGeneration === session.sessionGeneration
  );
}

export function useButtonPermissions(): ButtonPermissionSnapshot {
  return useSyncExternalStore(
    subscribeButtonPermissions,
    getButtonPermissionSnapshot,
    getButtonPermissionSnapshot,
  );
}
