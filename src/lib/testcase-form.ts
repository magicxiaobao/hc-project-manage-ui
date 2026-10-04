/**
 * 测试用例表单的载荷构建与校验（P2：p2-testcase-list-detail）。
 *
 * 纯函数，可独立测试。契约忠实于后端 TestCaseCreateRequest / TestCaseUpdateRequest
 * （见 src/lib/api/testCase-types.ts）与老前端 TestCaseForm.vue 的校验规则：
 * - title 必填（老前端要求 2-200 字符），caseNumber 必填（≤50，字母/数字/下划线/连字符）
 * - testType/priority/status 必填且走白名单；写入侧 status 不允许 ARCHIVED
 *   （后端 TestCaseServiceImpl 显式拒绝）
 * - description ≤2000；testSteps/expectedResult 必填
 * - assigneeId：空白=未设置（null），否则严格正整数
 * - estimatedDuration：空白=未设置（null），否则 1-480 的整数分钟
 * - verifiesRequirementIds（仅新建）：逗号分隔的需求 ID，≤200，非法 token 报错
 * - 更新载荷：字段级更新；description 恒发送 trim 后字符串（'' = 清空，
 *   后端 updateEditableFields 用 `!= null` 判定，支持写入空字符串——忠实老前端
 *   TestCaseForm.vue）；preconditions/testData/environmentRequirements/tags
 *   空文本 → undefined（字段省略，后端保留原值，忠实老前端 trimOptional）；
 *   assigneeId 空白 → undefined（保留原值），清空已有负责人由校验显式拒绝
 *   （老前端 TestCaseForm.vue:105），不静默忽略；
 *   verifiesRequirementIds 不在更新载荷里（类型已排除，静默 no-op 陷阱）
 */
import { parseIdListText } from './defect-create';
import { parseOptionalPositiveInt } from './task-create';
import type {
  TestCaseCreatePayload,
  TestCaseResponse,
  TestCaseStatus,
  TestCaseUpdatePayload,
} from './api/testCase-types';
import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_CASE_TYPES,
} from './api/testCase-types';

/** 测试用例表单输入（控件状态的中间表示，全部为字符串/原始值） */
export interface TestCaseFormInput {
  title: string;
  caseNumber: string;
  description: string;
  testType: string;
  priority: string;
  status: string;
  assigneeId: string;
  preconditions: string;
  testSteps: string;
  expectedResult: string;
  testData: string;
  environmentRequirements: string;
  tags: string;
  estimatedDuration: string;
  /** 验证需求：逗号分隔的需求 ID（仅新建表单使用） */
  verifiesRequirementIdsText: string;
}

export const MAX_TESTCASE_TITLE_LENGTH = 200;
export const MIN_TESTCASE_TITLE_LENGTH = 2;
export const MAX_TESTCASE_NUMBER_LENGTH = 50;
export const MAX_TESTCASE_DESCRIPTION_LENGTH = 2000;
/** 关联验证需求上限：沿用 defect-create 的 MAX_RELATION_IDS（后端同约束） */
export const MAX_VERIFIES_REQUIREMENT_IDS = 200;
/** 预计时长上限：老前端 TestCaseForm 规则（1-480 分钟） */
export const MAX_ESTIMATED_DURATION_MINUTES = 480;

const CASE_NUMBER_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 空表单默认值：状态 DRAFT（与老前端 TestCaseForm 默认一致） */
export function emptyTestCaseFormInput(): TestCaseFormInput {
  return {
    title: '',
    caseNumber: '',
    description: '',
    testType: '',
    priority: '',
    status: 'DRAFT',
    assigneeId: '',
    preconditions: '',
    testSteps: '',
    expectedResult: '',
    testData: '',
    environmentRequirements: '',
    tags: '',
    estimatedDuration: '',
    verifiesRequirementIdsText: '',
  };
}

/** 由 TestCaseResponse 回填编辑表单（attachments/testSuite 等不进表单，不回填不写回） */
export function editFormFromTestCase(detail: TestCaseResponse): TestCaseFormInput {
  return {
    title: detail.title ?? '',
    caseNumber: detail.caseNumber ?? '',
    description: detail.description ?? '',
    testType: detail.testType ?? '',
    priority: detail.priority ?? '',
    status: detail.status === 'ARCHIVED' ? 'DRAFT' : detail.status,
    assigneeId: detail.assigneeId != null ? String(detail.assigneeId) : '',
    preconditions: detail.preconditions ?? '',
    testSteps: detail.testSteps ?? '',
    expectedResult: detail.expectedResult ?? '',
    testData: detail.testData ?? '',
    environmentRequirements: detail.environmentRequirements ?? '',
    tags: detail.tags ?? '',
    estimatedDuration: detail.estimatedDuration != null ? String(detail.estimatedDuration) : '',
    verifiesRequirementIdsText: '',
  };
}

/** 字段级校验错误：调用方按 field 挂到对应输入下展示 */
export interface TestCaseFormFieldError {
  field:
    | 'title'
    | 'caseNumber'
    | 'description'
    | 'testType'
    | 'priority'
    | 'status'
    | 'assigneeId'
    | 'testSteps'
    | 'expectedResult'
    | 'estimatedDuration'
    | 'verifiesRequirementIdsText';
  message: string;
}

const isWritableStatus = (value: string): boolean =>
  (TEST_CASE_STATUSES as readonly string[]).includes(value) && value !== 'ARCHIVED';

/**
 * 编辑时可选的目标状态（忠实后端 TestCaseStatusEnum.canTransitionTo；
 * ARCHIVED 目标一律走 invalid 专用入口，不在编辑表单出现；普通更新入口对
 * ARCHIVED 记录直接拒绝——见 TestCaseServiceImpl.updateTestCase /
 * validateOrdinaryStatusChange）：
 * - DRAFT → DRAFT / ACTIVE / REVIEW
 * - ACTIVE → ACTIVE / REVIEW（ACTIVE→DRAFT 后端拒绝）
 * - REVIEW → REVIEW / ACTIVE / DRAFT
 * - ARCHIVED → 无（不可编辑）
 */
export function allowedTargetStatuses(
  current: TestCaseStatus,
): Array<Exclude<TestCaseStatus, 'ARCHIVED'>> {
  switch (current) {
    case 'DRAFT':
      return ['DRAFT', 'ACTIVE', 'REVIEW'];
    case 'ACTIVE':
      return ['ACTIVE', 'REVIEW'];
    case 'REVIEW':
      return ['REVIEW', 'ACTIVE', 'DRAFT'];
    case 'ARCHIVED':
    default:
      return [];
  }
}

/**
 * 归档入口允许的源状态（忠实后端 TestCaseServiceImpl.archiveTestCases：
 * "只有草稿或生效测试用例可以归档"）。
 */
export function canArchiveTestCase(status: TestCaseStatus): boolean {
  return status === 'DRAFT' || status === 'ACTIVE';
}

/**
 * 校验表单输入，返回字段级错误列表（空表示通过）。
 * includeVerifiesRequirementIds 为 true 时才校验验证需求栏（新建表单）；
 * 编辑表单不渲染该栏，不校验。
 * originalAssigneeId 为编辑前负责人的原始值（initial.assigneeId）：原有负责人
 * 被清空时按老前端 TestCaseForm.vue:105 口径显式拒绝（"当前更新契约不支持
 * 清空负责人"），而不是静默保留原值。
 */
export function validateTestCaseFormInput(
  input: TestCaseFormInput,
  options: {
    includeVerifiesRequirementIds?: boolean;
    originalAssigneeId?: string | null;
  } = {},
): TestCaseFormFieldError[] {
  const errors: TestCaseFormFieldError[] = [];

  const title = input.title.trim();
  if (!title) {
    errors.push({ field: 'title', message: '标题不能为空' });
  } else if (title.length < MIN_TESTCASE_TITLE_LENGTH) {
    errors.push({ field: 'title', message: `标题至少${MIN_TESTCASE_TITLE_LENGTH}个字符` });
  } else if (title.length > MAX_TESTCASE_TITLE_LENGTH) {
    errors.push({ field: 'title', message: `标题不能超过${MAX_TESTCASE_TITLE_LENGTH}个字符` });
  }

  const caseNumber = input.caseNumber.trim();
  if (!caseNumber) {
    errors.push({ field: 'caseNumber', message: '用例编号不能为空' });
  } else if (caseNumber.length > MAX_TESTCASE_NUMBER_LENGTH) {
    errors.push({ field: 'caseNumber', message: `用例编号不能超过${MAX_TESTCASE_NUMBER_LENGTH}个字符` });
  } else if (!CASE_NUMBER_PATTERN.test(caseNumber)) {
    errors.push({ field: 'caseNumber', message: '用例编号仅支持字母、数字、下划线和连字符' });
  }

  if (input.description.trim().length > MAX_TESTCASE_DESCRIPTION_LENGTH) {
    errors.push({ field: 'description', message: `描述不能超过${MAX_TESTCASE_DESCRIPTION_LENGTH}个字符` });
  }

  if (!input.testType.trim()) {
    errors.push({ field: 'testType', message: '测试类型不能为空' });
  } else if (!(TEST_CASE_TYPES as readonly string[]).includes(input.testType)) {
    errors.push({ field: 'testType', message: '测试类型不在可选范围内' });
  }

  if (!input.priority.trim()) {
    errors.push({ field: 'priority', message: '优先级不能为空' });
  } else if (!(TEST_CASE_PRIORITIES as readonly string[]).includes(input.priority)) {
    errors.push({ field: 'priority', message: '优先级不在可选范围内' });
  }

  if (!input.status.trim()) {
    errors.push({ field: 'status', message: '状态不能为空' });
  } else if (!isWritableStatus(input.status)) {
    errors.push({ field: 'status', message: '新建/编辑不支持归档状态' });
  }

  if (input.assigneeId.trim() !== '' && parseOptionalPositiveInt(input.assigneeId) === null) {
    errors.push({ field: 'assigneeId', message: '负责人 ID 必须为正整数' });
  } else if (
    options.originalAssigneeId != null &&
    options.originalAssigneeId.trim() !== '' &&
    input.assigneeId.trim() === ''
  ) {
    // 老前端 TestCaseForm.vue:105 口径：更新契约不支持清空已有负责人，显式报错
    errors.push({ field: 'assigneeId', message: '当前更新契约不支持清空负责人' });
  }

  if (!input.testSteps.trim()) {
    errors.push({ field: 'testSteps', message: '测试步骤不能为空' });
  }

  if (!input.expectedResult.trim()) {
    errors.push({ field: 'expectedResult', message: '期望结果不能为空' });
  }

  if (input.estimatedDuration.trim() !== '') {
    const minutes = parseOptionalPositiveInt(input.estimatedDuration);
    if (minutes === null || minutes > MAX_ESTIMATED_DURATION_MINUTES) {
      errors.push({
        field: 'estimatedDuration',
        message: `预计时长须为 1-${MAX_ESTIMATED_DURATION_MINUTES} 分钟的整数`,
      });
    }
  }

  if (options.includeVerifiesRequirementIds) {
    const parsed = parseIdListText(input.verifiesRequirementIdsText);
    if (parsed.invalid.length > 0) {
      errors.push({
        field: 'verifiesRequirementIdsText',
        message: `验证需求 ID 格式非法：${parsed.invalid.join('、')}`,
      });
    } else if (new Set(parsed.ids).size > MAX_VERIFIES_REQUIREMENT_IDS) {
      errors.push({
        field: 'verifiesRequirementIdsText',
        message: `验证需求不能超过${MAX_VERIFIES_REQUIREMENT_IDS}个（后端约束）`,
      });
    }
  }

  return errors;
}

/**
 * 载荷用的空值归一化：TestCaseCreatePayload/UpdatePayload 的可选字段为
 * `T | undefined`（不接受 null），空文本 → undefined（JSON 序列化时省略，
 * 后端只应用非空字段 = 保留原值）。与 defect 域的 null 口径不同，注意区分。
 */
const undefinedIfBlank = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const whiteList = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** 由表单输入构建 TestCaseCreatePayload。调用前应先跑 validateTestCaseFormInput */
export function buildTestCaseCreatePayload(
  input: TestCaseFormInput,
  projectId: number,
): TestCaseCreatePayload {
  const verifiesRequirementIds = [
    ...new Set(parseIdListText(input.verifiesRequirementIdsText).ids),
  ];
  return {
    title: input.title.trim(),
    description: undefinedIfBlank(input.description),
    caseNumber: undefinedIfBlank(input.caseNumber),
    testType: whiteList(input.testType, TEST_CASE_TYPES, '功能测试'),
    priority: whiteList(input.priority, TEST_CASE_PRIORITIES, '中'),
    status: whiteList(input.status, ['DRAFT', 'ACTIVE', 'REVIEW'] as const, 'DRAFT'),
    projectId,
    assigneeId: parseOptionalPositiveInt(input.assigneeId) ?? undefined,
    preconditions: undefinedIfBlank(input.preconditions),
    testSteps: input.testSteps.trim(),
    expectedResult: input.expectedResult.trim(),
    testData: undefinedIfBlank(input.testData),
    environmentRequirements: undefinedIfBlank(input.environmentRequirements),
    tags: undefinedIfBlank(input.tags),
    estimatedDuration: parseOptionalPositiveInt(input.estimatedDuration) ?? undefined,
    verifiesRequirementIds,
  };
}

/**
 * 由编辑表单组装 POST /testCase/v1/updateTestCase 载荷（id 必传，字段级更新）。
 * - description：恒发送 trim 后的字符串（'' = 清空；后端 updateEditableFields
 *   用 `!= null` 判定，支持写入空字符串——忠实老前端 TestCaseForm.vue 的
 *   `description: form.description.trim()`）
 * - preconditions/testData/environmentRequirements/tags：空文本 → undefined
 *   （字段省略，后端保留原值；忠实老前端的 trimOptional）
 * - assigneeId：空白 → undefined（保留原值）；清空已有负责人由校验显式拒绝
 *   （老前端 TestCaseForm.vue:105），不静默忽略
 * - verifiesRequirementIds 明确不承载（更新接口收到会静默忽略，静默 no-op 陷阱）
 */
export function buildTestCaseUpdatePayload(
  testCaseId: number,
  input: TestCaseFormInput,
): TestCaseUpdatePayload {
  return {
    id: testCaseId,
    title: input.title.trim(),
    description: input.description.trim(),
    caseNumber: undefinedIfBlank(input.caseNumber),
    testType: whiteList(input.testType, TEST_CASE_TYPES, '功能测试'),
    priority: whiteList(input.priority, TEST_CASE_PRIORITIES, '中'),
    status: whiteList(input.status, ['DRAFT', 'ACTIVE', 'REVIEW'] as const, 'DRAFT'),
    assigneeId: parseOptionalPositiveInt(input.assigneeId) ?? undefined,
    preconditions: undefinedIfBlank(input.preconditions),
    testSteps: input.testSteps.trim(),
    expectedResult: input.expectedResult.trim(),
    testData: undefinedIfBlank(input.testData),
    environmentRequirements: undefinedIfBlank(input.environmentRequirements),
    tags: undefinedIfBlank(input.tags),
    estimatedDuration: parseOptionalPositiveInt(input.estimatedDuration) ?? undefined,
  };
}
