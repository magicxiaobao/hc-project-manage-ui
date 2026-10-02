import { columnOf, type ColumnId, type ItemKind, type WorkItem } from "./domain.ts";

export interface BoardItemFilter {
  projectId: string | undefined;
  sprintId: string;
  allItemsMode: boolean;
  kind: "all" | ItemKind;
  mine: boolean;
  currentUserId: string;
  showCancelled: boolean;
}

export function selectBoardItems(source: WorkItem[], filter: BoardItemFilter) {
  const visible = source.filter((item) => {
    if (!filter.projectId || item.projectId !== filter.projectId) return false;
    if (!filter.allItemsMode) {
      if (filter.sprintId && item.sprintId !== filter.sprintId) return false;
      if (!filter.sprintId && item.sprintId) return false;
    }
    if (filter.kind !== "all" && item.kind !== filter.kind) return false;
    if (filter.mine && item.assigneeId !== filter.currentUserId) return false;
    if (!filter.showCancelled && columnOf(item.kind, item.status) === "cancelled") return false;
    return true;
  });
  return {
    items: visible.filter((item) => columnOf(item.kind, item.status) !== "cancelled"),
    cancelledItems: visible.filter((item) => columnOf(item.kind, item.status) === "cancelled"),
  };
}

export type BoardMoveResult = { ok: true } | { ok: false; message: string; requiresReason?: string };
export type MoveToColumn = (id: string, column: ColumnId, reason?: string, expectedStatus?: string) => BoardMoveResult;
export interface PendingBoardMove {
  id: string;
  key: string;
  kind: ItemKind;
  column: ColumnId;
  fromStatus: string;
  toStatus: string;
}

export function confirmBoardMove(pending: PendingBoardMove | null, reason: string, move: MoveToColumn): BoardMoveResult | null {
  if (!pending) return null;
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { ok: false, message: "这次流转需要填写原因。", requiresReason: pending.toStatus };
  return move(pending.id, pending.column, trimmedReason, pending.fromStatus);
}
