/**
 * 任务新建表单载荷组装（P1：p1-task-create）。
 *
 * 纯函数，可独立测试。契约忠实于后端 TaskCreateRequest 与老前端
 * frontend/src/views/task/TaskCreate.vue 的提交逻辑：
 * - title / taskType / priority / projectId 必填（老前端表单即如此校验）
 * - 计划日期为 LocalDate 字符串 'yyyy-MM-dd'，直接透传，不做时区换算
 *   （老前端 toDateOnly 注释：DATE 列契约，直接提交 YYYY-MM-DD）
 * - 可选字段留空时不提交（undefined），后端按"未提交"处理
 * - implementsRequirementIds：去重、上限 200（后端约束"最多 200 条"）
 */
import { TASK_PRIORITIES } from './api/task-types';
import type { TaskCreatePayload, TaskPriority } from './api/task-types';

/** 表单原始输入（均为受控组件的字符串值 + 已选需求 id 集合） */
export interface TaskCreateFormInput {
  title: string;
  taskType: string;
  priority: string;
  description: string;
  storyPointsText: string;
  parentIdText: string;
  assigneeIdText: string;
  reporterIdText: string;
  startIso: string;
  endIso: string;
  estimatedHoursText: string;
  tags: string;
  implementsRequirementIds: number[];
}

/** 解析可选的正整数（执行人/报告人/父任务 id）：空 → null；非纯数字 → null */
export function parseOptionalPositiveInt(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * 解析必填的正整数（路由 ID / 必填的用户 ID 输入）：非纯数字 → null。
 *
 * 与 parseOptionalPositiveInt 的区别：多一轮 String 回绕校验，拦截超安全整数
 * 范围的静默舍入——Number("9007199254740993") 会舍入为 9007199254740992，
 * 而 Number.isSafeInteger(9007199254740992) 仍为 true，直接校验会静默取到
 * 另一个 ID 的记录。回绕校验同时拒绝前导零（"007" 非规范十进制表示）。
 */
export function parseRequiredPositiveInt(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0 || String(value) !== trimmed) {
    return null;
  }
  return value;
}

/** 解析可选的非负整数（故事点）：空 → null；非纯数字 → null */
export function parseOptionalNonNegativeInt(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** 解析可选的非负数字（预估工时，允许小数）：空/非法 → null */
export function parseOptionalNonNegativeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * 表单校验：返回首个错误文案，通过返回 null。
 * 校验项与老前端 TaskCreate 提交前置条件一致（标题/类型/优先级必填），
 * 另加：起止日期先后关系、id 类字段必须为纯数字（避免误送后端）。
 */
export function validateTaskCreateInput(input: TaskCreateFormInput): string | null {
  if (!input.title.trim()) return '请填写任务标题';
  if (!input.taskType.trim()) return '请填写任务类型';
  if (!(TASK_PRIORITIES as readonly string[]).includes(input.priority)) return '请选择优先级';
  for (const [label, text] of [
    ['故事点', input.storyPointsText],
    ['父任务 ID', input.parentIdText],
    ['执行人用户 ID', input.assigneeIdText],
    ['报告人用户 ID', input.reporterIdText],
  ] as const) {
    if (!text.trim()) continue;
    // Codex review 4175265685：id 字段必须用与载荷组装相同的规则校验
    // （正整数 + 安全整数范围），不能只用 /^\d+$/——"0" 或超大数字会通过
    // 校验，却在 buildTaskCreatePayload 里被静默丢弃，用户以为关联成功了。
    const isIdField = label !== '故事点';
    const valid = isIdField
      ? parseOptionalPositiveInt(text) !== null
      : parseOptionalNonNegativeInt(text) !== null;
    if (!valid) return `${label}必须为${isIdField ? '正整数' : '非负整数'}`;
  }
  if (input.estimatedHoursText.trim() && parseOptionalNonNegativeNumber(input.estimatedHoursText) === null) {
    return '预估工时必须为非负数字';
  }
  if (input.startIso && input.endIso && input.startIso > input.endIso) {
    return '开始日期不能晚于结束日期';
  }
  // Codex review 4175337091：后端 TaskCreateRequest 对 implementsRequirementIds 有
  // @Size(max=200)（"关联需求不能超过200个"）；超过时必须在提交前报错，而不是
  // 在 buildTaskCreatePayload 里静默截断——用户会误以为全部关联成功。
  if (new Set(input.implementsRequirementIds).size > MAX_REQUIREMENT_LINKS) {
    return `关联需求不能超过${MAX_REQUIREMENT_LINKS}个（后端约束）`;
  }
  return null;
}

const MAX_REQUIREMENT_LINKS = 200;

/** 表单输入 → POST /task/v1/createTask 载荷（可选字段留空即不提交） */
export function buildTaskCreatePayload(
  input: TaskCreateFormInput,
  projectId: number,
): TaskCreatePayload {
  const payload: TaskCreatePayload = {
    title: input.title.trim(),
    taskType: input.taskType.trim(),
    priority: input.priority as TaskPriority,
    projectId,
  };
  const description = input.description.trim();
  if (description) payload.description = description;
  const storyPoints = parseOptionalNonNegativeInt(input.storyPointsText);
  if (storyPoints !== null) payload.storyPoints = storyPoints;
  const parentId = parseOptionalPositiveInt(input.parentIdText);
  if (parentId !== null) payload.parentId = parentId;
  const assigneeId = parseOptionalPositiveInt(input.assigneeIdText);
  if (assigneeId !== null) payload.assigneeId = assigneeId;
  const reporterId = parseOptionalPositiveInt(input.reporterIdText);
  if (reporterId !== null) payload.reporterId = reporterId;
  // 计划日期：LocalDate 'yyyy-MM-dd' 直接透传，不做时区换算
  if (input.startIso) payload.estimatedStartDate = input.startIso;
  if (input.endIso) payload.estimatedEndDate = input.endIso;
  const estimatedHours = parseOptionalNonNegativeNumber(input.estimatedHoursText);
  if (estimatedHours !== null) payload.estimatedHours = estimatedHours;
  const tags = input.tags.trim();
  if (tags) payload.tags = tags;
  const requirementIds = [...new Set(input.implementsRequirementIds)].slice(0, MAX_REQUIREMENT_LINKS);
  if (requirementIds.length > 0) payload.implementsRequirementIds = requirementIds;
  return payload;
}

/** 空表单初始值 */
export function emptyTaskCreateFormInput(): TaskCreateFormInput {
  return {
    title: '',
    taskType: '',
    priority: '',
    description: '',
    storyPointsText: '',
    parentIdText: '',
    assigneeIdText: '',
    reporterIdText: '',
    startIso: '',
    endIso: '',
    estimatedHoursText: '',
    tags: '',
    implementsRequirementIds: [],
  };
}
