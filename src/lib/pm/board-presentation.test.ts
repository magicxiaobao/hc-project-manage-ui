import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkItem } from "./domain.ts";
import { COLUMNS, columnOf } from "./domain.ts";
import { confirmBoardMove, selectBoardItems, type BoardItemFilter, type PendingBoardMove } from "./board-presentation.ts";

function item(id: string, patch: Partial<WorkItem> = {}): WorkItem {
  return {
    id, key: id, projectId: "project-a", kind: "task", requirementType: null,
    taskType: null, defectType: null, severity: null, title: id, description: "",
    priority: "MEDIUM", status: "TODO", assigneeId: "me", reporterId: "me",
    sprintId: "sprint-a", versionId: null, parentId: null, storyPoints: null,
    progress: 0, estimatedHours: null, tags: [], createdAt: "2026-10-01", updatedAt: "2026-10-01",
    ...patch,
  };
}

const filters: BoardItemFilter = {
  projectId: "project-a", sprintId: "sprint-a", allItemsMode: false,
  kind: "all", mine: false, currentUserId: "me", showCancelled: true,
};
const sample = [
  item("active-task"),
  item("cancelled-task", { status: "CANCELLED" }),
  item("cancelled-requirement", { kind: "requirement", status: "CANCELLED" }),
  item("rejected-defect", { kind: "defect", status: "REJECTED" }),
  item("closed-defect", { kind: "defect", status: "CLOSED" }),
];
const ids = (items: WorkItem[]) => items.map((entry) => entry.id);

describe("selectBoardItems", () => {
  it("shows cancelled and rejected items in a separate group when enabled", () => {
    const result = selectBoardItems(sample, filters);
    assert.deepEqual(ids(result.items), ["active-task", "closed-defect"]);
    assert.deepEqual(ids(result.cancelledItems), ["cancelled-task", "cancelled-requirement", "rejected-defect"]);
    assert.equal(result.items.length + result.cancelledItems.length, sample.length);
  });

  it("hides only the cancelled group when disabled, without changing active columns", () => {
    const shown = selectBoardItems(sample, filters);
    const hidden = selectBoardItems(sample, { ...filters, showCancelled: false });
    assert.deepEqual(hidden.items, shown.items);
    assert.deepEqual(hidden.cancelledItems, []);
  });

  it("applies project, sprint, kind and assignee filters before either group", () => {
    const source = [
      item("my-active-defect", { kind: "defect", status: "NEW" }),
      item("my-rejected-defect", { kind: "defect", status: "REJECTED" }),
      item("other-project", { projectId: "project-b", kind: "defect", status: "REJECTED" }),
      item("other-sprint", { sprintId: "sprint-b", kind: "defect", status: "REJECTED" }),
      item("other-kind", { status: "CANCELLED" }),
      item("other-person", { assigneeId: "other", kind: "defect", status: "REJECTED" }),
      item("unassigned", { assigneeId: null, kind: "defect", status: "REJECTED" }),
    ];
    const result = selectBoardItems(source, { ...filters, kind: "defect", mine: true });
    assert.deepEqual(ids(result.items), ["my-active-defect"]);
    assert.deepEqual(ids(result.cancelledItems), ["my-rejected-defect"]);
  });

  it("keeps backlog-only semantics when there is no selected sprint", () => {
    const source = [
      ...sample,
      item("backlog-active", { sprintId: null }),
      item("backlog-cancelled", { sprintId: null, status: "CANCELLED" }),
    ];
    const result = selectBoardItems(source, { ...filters, sprintId: "" });
    assert.deepEqual(ids(result.items), ["backlog-active"]);
    assert.deepEqual(ids(result.cancelledItems), ["backlog-cancelled"]);
  });

  it("includes all sprints and backlog for the main board while keeping other filters", () => {
    const source = [
      item("sprint-a", { status: "CANCELLED" }),
      item("sprint-b", { status: "CANCELLED", sprintId: "sprint-b" }),
      item("backlog", { status: "CANCELLED", sprintId: null }),
      item("another-project", { status: "CANCELLED", projectId: "project-b" }),
    ];
    const result = selectBoardItems(source, { ...filters, allItemsMode: true });
    assert.deepEqual(ids(result.cancelledItems), ["sprint-a", "sprint-b", "backlog"]);
  });

  it("shows no items for a missing project", () => {
    assert.deepEqual(selectBoardItems(sample, { ...filters, projectId: undefined }), { items: [], cancelledItems: [] });
  });

  it("never treats cancelled items as drop columns or mutates source data", () => {
    const before = structuredClone(sample);
    const result = selectBoardItems(sample, filters);
    assert.equal(COLUMNS.some((column) => String(column.id) === "cancelled"), false);
    assert.ok(result.items.every((entry) => COLUMNS.some((column) => column.id === columnOf(entry.kind, entry.status))));
    assert.ok(result.cancelledItems.every((entry) => columnOf(entry.kind, entry.status) === "cancelled"));
    assert.deepEqual(sample, before);
  });
});

const pending: PendingBoardMove = {
  id: "closed-defect", key: "HC-1", kind: "defect", column: "todo", fromStatus: "CLOSED", toStatus: "REOPEN",
};

describe("confirmBoardMove", () => {
  it("does nothing after cancellation clears the pending move", () => {
    let calls = 0;
    const result = confirmBoardMove(null, "用户原因", () => { calls += 1; return { ok: true }; });
    assert.equal(result, null);
    assert.equal(calls, 0);
  });

  it("rejects blank reasons without calling the store", () => {
    let calls = 0;
    for (const reason of ["", " ", "\n\t"]) {
      const result = confirmBoardMove(pending, reason, () => { calls += 1; return { ok: true }; });
      assert.equal(result?.ok, false);
    }
    assert.equal(calls, 0);
  });

  it("sends the real trimmed reason and original status exactly once", () => {
    const calls: unknown[][] = [];
    const result = confirmBoardMove(pending, "  重新检查边界情况  ", (...args) => { calls.push(args); return { ok: true }; });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [["closed-defect", "todo", "重新检查边界情况", "CLOSED"]]);
  });

  it("preserves stale-state and other store errors for visible feedback", () => {
    const failure = { ok: false as const, message: "事项状态已改变，请重新操作。" };
    assert.equal(confirmBoardMove(pending, "有效原因", () => failure), failure);
  });
});
