import assert from "node:assert/strict";
import { it } from "node:test";
import { commentSubmitted, hoursError, keptSprintId, sameCreateForm, storyPointsWrite } from "./edit-rules.ts";

const opened = {
  kind: "requirement" as const,
  requirementType: "Story" as const,
  taskType: "开发任务",
  defectType: "功能缺陷",
  severity: "MAJOR",
  title: "",
  description: "",
  priority: "MEDIUM" as const,
  assigneeId: "",
  sprintId: "",
  projectId: "pr-a",
};

it("treats an unchanged create form as clean, including a revert", () => {
  assert.equal(sameCreateForm(opened, opened), true);
  assert.equal(sameCreateForm({ ...opened, title: "x" }, opened), false);
  assert.equal(sameCreateForm({ ...opened, title: "x", projectId: "pr-b" }, { ...opened, title: "x", projectId: "pr-b" }), true);
});

it("drops a sprint that is closed or not in this project", () => {
  const sprints = [
    { id: "s-open", projectId: "pr-a", state: "active" },
    { id: "s-closed", projectId: "pr-a", state: "closed" },
    { id: "s-other", projectId: "pr-b", state: "active" },
  ];
  assert.equal(keptSprintId("s-open", sprints, "pr-a"), "s-open");
  assert.equal(keptSprintId("s-closed", sprints, "pr-a"), "");
  assert.equal(keptSprintId("s-other", sprints, "pr-a"), "");
  assert.equal(keptSprintId("", sprints, "pr-a"), "");
});

it("flags only hours outside 0 to 24", () => {
  assert.equal(hoursError("0"), "工时要在 0 到 24 小时之间");
  assert.equal(hoursError("25"), "工时要在 0 到 24 小时之间");
  assert.equal(hoursError(""), "工时要在 0 到 24 小时之间");
  assert.equal(hoursError("0.3"), null);
  assert.equal(hoursError("1"), null);
  assert.equal(hoursError("24"), null);
});

it("writes 0 for a story point that is not finite", () => {
  assert.equal(storyPointsWrite(3), 3);
  assert.equal(storyPointsWrite(Number.NaN), 0);
});

it("counts a comment as submitted only when trimmed text remains", () => {
  assert.equal(commentSubmitted("  "), false);
  assert.equal(commentSubmitted("留下"), true);
});
