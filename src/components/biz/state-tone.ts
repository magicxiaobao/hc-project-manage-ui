import type { ItemKind, Sprint, VersionStatus } from "@/lib/pm/domain";

/** 业务色：灰未开始，蓝推进，橙等待，绿完成，红终止，描边表示退回。 */
export type StateTone = "neutral" | "progress" | "review" | "done" | "danger" | "revert";

export function itemStatusTone(kind: ItemKind, status: string): StateTone {
  if (status === "CANCELLED" || status === "REJECTED") return "danger";
  if (status === "PAUSED" || status === "REOPEN") return "review";
  if (status === "REVIEW" || status === "PENDING_VERIFICATION" || status === "TESTING") return "review";
  if (status === "COMPLETED" || status === "RESOLVED" || status === "VERIFIED" || status === "CLOSED") return "done";
  if (status === "IN_DEVELOPMENT" || status === "IN_PROGRESS" || status === "ASSIGNED" || status === "APPROVED") return "progress";
  void kind;
  return "neutral";
}

export function transitionTone(kind: ItemKind, to: string): StateTone {
  if (to === "CANCELLED" || to === "REJECTED") return "danger";
  if (to === "DRAFT" || to === "REOPEN" || to === "NEW") return "revert";
  return itemStatusTone(kind, to);
}

export function sprintTone(state: Sprint["state"]): StateTone {
  if (state === "active") return "progress";
  if (state === "closed") return "done";
  return "neutral";
}

export function versionStatusTone(status: VersionStatus): StateTone {
  if (status === "DEVELOPMENT") return "progress";
  if (status === "TESTING" || status === "FROZEN") return "review";
  if (status === "RELEASED") return "done";
  if (status === "DEPRECATED") return "danger";
  return "neutral";
}

export function versionEventTone(event: string): StateTone {
  if (event === "DEPRECATE") return "danger";
  if (event === "RETURN_TO_PLANNING" || event === "RETURN_TO_DEVELOPMENT") return "revert";
  if (event === "START_DEVELOPMENT") return "progress";
  if (event === "START_TESTING" || event === "REOPEN_TESTING" || event === "FREEZE") return "review";
  return "neutral";
}

export function severityTone(severity: string): StateTone {
  if (severity === "BLOCKER" || severity === "CRITICAL") return "danger";
  if (severity === "MAJOR") return "review";
  if (severity === "MINOR" || severity === "TRIVIAL") return "done";
  return "neutral";
}

export function columnTone(column: "todo" | "doing" | "check" | "done"): StateTone {
  if (column === "doing") return "progress";
  if (column === "check") return "review";
  if (column === "done") return "done";
  return "neutral";
}

export const toneDotClass: Record<StateTone, string> = {
  neutral: "bg-faint",
  progress: "bg-primary",
  review: "bg-warning",
  done: "bg-success",
  danger: "bg-danger",
  revert: "bg-muted",
};
