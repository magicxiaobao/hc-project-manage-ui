import type { WorkLogResponse } from "./api/worklog-types";
import { localDateTime } from "./worklog-form";
export function workLogActions(record: Pick<WorkLogResponse, "status">) {
  return {
    pause: record.status === "进行中",
    complete: record.status === "进行中" || record.status === "暂停",
    edit: ["进行中", "暂停", "已完成"].includes(record.status ?? ""),
  };
}
export function referenceElapsed(
  record: Pick<WorkLogResponse, "status" | "startTime" | "endTime">,
  now: number,
): number | null {
  if (
    record.status !== "进行中" ||
    record.endTime ||
    !record.startTime ||
    !localDateTime(record.startTime)
  )
    return null;
  const start = new Date(record.startTime).getTime();
  return Number.isFinite(start) && Number.isFinite(now)
    ? Math.max(0, Math.floor((now - start) / 1000))
    : null;
}
