export type CreateForm = {
  kind: "requirement" | "task" | "defect";
  requirementType: "Epic" | "Story" | "Task";
  taskType: string;
  defectType: string;
  severity: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  assigneeId: string;
  sprintId: string;
  projectId: string;
};

const createFields = [
  "kind",
  "requirementType",
  "taskType",
  "defectType",
  "severity",
  "title",
  "description",
  "priority",
  "assigneeId",
  "sprintId",
  "projectId",
] as const;

export function sameCreateForm(a: CreateForm, b: CreateForm): boolean {
  return createFields.every((key) => a[key] === b[key]);
}


export function createDraftOnClose(current: CreateForm, opened: CreateForm, restored: boolean): CreateForm | null {
  if (sameCreateForm(current, opened) && !restored) return null;
  return current;
}

export function keptSprintId(
  sprintId: string,
  sprints: { id: string; projectId: string; state: string }[],
  projectId: string,
): string {
  const kept = sprints.find(
    (sprint) => sprint.id === sprintId && sprint.projectId === projectId && sprint.state !== "closed",
  );
  return kept ? sprintId : "";
}

const HOURS_MESSAGE = "工时要在 0 到 24 小时之间";

export function hoursError(raw: string): "工时要在 0 到 24 小时之间" | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 24) return HOURS_MESSAGE;
  return null;
}

export function storyPointsWrite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function commentSubmitted(body: string): boolean {
  return body.trim().length > 0;
}

/** 创建草稿按用户隔离：/me 切换用户时，他人的未发布输入不会串到当前用户 */
const savedCreateByUser = new Map<string, CreateForm>();

export function readCreateDraft(userId: string): CreateForm | null {
  return savedCreateByUser.get(userId) ?? null;
}

export function writeCreateDraft(userId: string, value: CreateForm | null) {
  if (value) savedCreateByUser.set(userId, value);
  else savedCreateByUser.delete(userId);
}

export function clearCreateDraft(userId?: string) {
  if (userId === undefined) savedCreateByUser.clear();
  else savedCreateByUser.delete(userId);
}

export const commentDrafts = new Map<string, string>();

export function clearCommentDrafts() {
  commentDrafts.clear();
}
