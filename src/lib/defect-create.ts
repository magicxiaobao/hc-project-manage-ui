import { parseRequiredPositiveInt } from './task-create';
import type { DefectCreatePayload } from './api/defect-types';

/**
 * 缺陷新建表单的载荷构建与校验（P2：p2-defect-list-create）。
 *
 * 纯函数，可独立测试。契约忠实于后端 DefectCreateRequest
 * （见 src/lib/api/defect-types.ts DefectCreatePayload）：
 * - title 必填（去空白后非空）且 ≤200 字符；severity/priority 走前端常量六档/三档
 * - affectedRequirementIds/foundInTaskIds 为逗号分隔的正整数 ID（逗号/中文逗号/空白分隔）；
 *   每侧上限 200（后端约束），格式非法或超限时校验报错，parseRequiredPositiveInt 复用 task-create 的安全整数回绕校验
 * - 未填写的可选字段传 null（老前端 DefectForm 同一口径）
 */

/** 缺陷新建表单输入（控件状态的中间表示，全部为字符串/原始值） */
export interface DefectCreateFormInput {
  title: string;
  defectType: string;
  severity: string;
  priority: string;
  environment: string;
  description: string;
  reproductionSteps: string;
  expectedResult: string;
  actualResult: string;
  /** 关联需求：逗号分隔的需求 ID */
  affectedRequirementIdsText: string;
  /** 关联任务：逗号分隔的任务 ID */
  foundInTaskIdsText: string;
}

/** 空表单默认值：严重度 NORMAL、优先级 MEDIUM（与老前端 DefectForm 默认一致） */
export function emptyDefectCreateFormInput(): DefectCreateFormInput {
  return {
    title: '',
    defectType: '',
    severity: 'NORMAL',
    priority: 'MEDIUM',
    environment: '',
    description: '',
    reproductionSteps: '',
    expectedResult: '',
    actualResult: '',
    affectedRequirementIdsText: '',
    foundInTaskIdsText: '',
  };
}

/**
 * 解析逗号分隔的 ID 列表（逗号/中文逗号/空白分隔）。
 * 返回 { ids, invalid }：invalid 为格式非法的 token（复用 parseRequiredPositiveInt，
 * 空输入 → ids=[] 且 invalid=[]，无声通过）。
 */
export function parseIdListText(text: string): { ids: number[]; invalid: string[] } {
  const tokens = text
    .split(/[,，\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const invalid: string[] = [];
  const ids: number[] = [];
  for (const token of tokens) {
    const value = parsePositiveIntStrict(token);
    if (value === null) {
      invalid.push(token);
    } else {
      ids.push(value);
    }
  }
  return { ids, invalid };
}

/**
 * 严格正整数解析（复用 @/lib/task-create 的安全整数校验语义）：
 * 纯数字、正整数、安全整数、无前导零回绕，否则 null。
 */
function parsePositiveIntStrict(text: string): number | null {
  return parseRequiredPositiveInt(text);
}

/** 关联 ID 上限：后端 normalizeRelationIds 对 >200 抛 AlmBatchLimitExceeded；与老前端/任务侧一致，前置校验而非静默截断 */
export const MAX_RELATION_IDS = 200;
/** 缺陷标题上限：DB title VARCHAR(200)，老前端 DefectForm.vue 同一口径 */
export const MAX_TITLE_LENGTH = 200;

/** 校验表单输入，返回错误文案列表（空表示通过） */
export function validateDefectCreateInput(input: DefectCreateFormInput): string[] {
  const errors: string[] = [];
  const title = input.title.trim();
  if (!title) errors.push('标题不能为空');
  else if (title.length > MAX_TITLE_LENGTH) errors.push(`标题不能超过${MAX_TITLE_LENGTH}个字符（后端 VARCHAR(200)）`);
  if (!input.severity.trim()) errors.push('严重度不能为空');
  if (!input.priority.trim()) errors.push('优先级不能为空');
  const requirementIds = parseIdListText(input.affectedRequirementIdsText);
  if (requirementIds.invalid.length > 0) {
    errors.push(`关联需求 ID 格式非法：${requirementIds.invalid.join('、')}`);
  } else if (new Set(requirementIds.ids).size > MAX_RELATION_IDS) {
    errors.push(`关联需求不能超过${MAX_RELATION_IDS}个（后端约束）`);
  }
  const taskIds = parseIdListText(input.foundInTaskIdsText);
  if (taskIds.invalid.length > 0) {
    errors.push(`关联任务 ID 格式非法：${taskIds.invalid.join('、')}`);
  } else if (new Set(taskIds.ids).size > MAX_RELATION_IDS) {
    errors.push(`关联任务不能超过${MAX_RELATION_IDS}个（后端约束）`);
  }
  return errors;
}

const nullIfBlank = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * 由表单输入构建 DefectCreatePayload。调用前应先跑 validateDefectCreateInput；
 * 此处对严重度/优先级做白名单收窄（防止表单状态被外部篡改为非法枚举值）。
 */
export function buildDefectCreatePayload(
  input: DefectCreateFormInput,
  projectId: number,
): DefectCreatePayload {
  const severities = ['BLOCKER', 'CRITICAL', 'MAJOR', 'NORMAL', 'MINOR', 'TRIVIAL'] as const;
  const priorities = ['HIGH', 'MEDIUM', 'LOW'] as const;
  const severity = (severities as readonly string[]).includes(input.severity)
    ? (input.severity as (typeof severities)[number])
    : 'NORMAL';
  const priority = (priorities as readonly string[]).includes(input.priority)
    ? (input.priority as (typeof priorities)[number])
    : 'MEDIUM';
  const requirementIds = [...new Set(parseIdListText(input.affectedRequirementIdsText).ids)];
  const taskIds = [...new Set(parseIdListText(input.foundInTaskIdsText).ids)];
  return {
    title: input.title.trim(),
    description: nullIfBlank(input.description),
    defectType: nullIfBlank(input.defectType),
    severity,
    priority,
    projectId,
    reporterId: null,
    assigneeId: null,
    foundDate: null,
    estimatedFixDate: null,
    reproductionSteps: nullIfBlank(input.reproductionSteps),
    expectedResult: nullIfBlank(input.expectedResult),
    actualResult: nullIfBlank(input.actualResult),
    environment: nullIfBlank(input.environment),
    attachments: null,
    tags: null,
    affectedRequirementIds: requirementIds,
    foundInTaskIds: taskIds,
  };
}
