/**
 * 测试套件表单的载荷构建与校验（P2：p2-testsuite-live）。
 *
 * 纯函数，可独立测试。契约忠实于后端 TestSuiteCreateRequest / TestSuiteUpdateRequest
 * （见 src/lib/api/testSuite-types.ts）与老前端 TestSuiteForm.vue 的校验规则：
 * - suiteName 必填（老前端要求 2-100 字符）
 * - suiteType/status/priority 必填且走白名单（老前端 rules 要求三者必选；
 *   后端为 String 不校验，但白名单防手滑写出非法枚举名）
 * - description ≤2000
 * - estimatedTime/actualTime：空白=未设置，否则严格正整数（分钟）
 * - 更新载荷：字段级更新；description 恒发送 trim 后字符串（'' = 清空，后端
 *   BaseTestSuiteUpdater 用 `Optional.ofNullable(...).ifPresent` 判定，非空即
 *   应用——口径同 testCase description）
 * - estimatedTime/actualTime：空白 → undefined（后端只更新非空值，无法置空）；
 *   编辑模式清空已有值时由校验显式拒绝（口径同 testCase estimatedDuration，
 *   codex r4 P2：不静默保留原值）
 */
import { parseOptionalPositiveInt } from './task-create';
import type {
  TestSuiteCreatePayload,
  TestSuitePriority,
  TestSuiteResponse,
  TestSuiteStatus,
  TestSuiteUpdatePayload,
} from './api/testSuite-types';
import {
  TEST_SUITE_PRIORITIES,
  TEST_SUITE_STATUSES,
  TEST_SUITE_TYPES,
} from './api/testSuite-types';

/** 测试套件表单输入（控件状态的中间表示，全部为字符串） */
export interface TestSuiteFormInput {
  suiteName: string;
  description: string;
  suiteType: string;
  status: string;
  priority: string;
  estimatedTime: string;
  actualTime: string;
}

export const MAX_TESTSUITE_NAME_LENGTH = 100;
export const MIN_TESTSUITE_NAME_LENGTH = 2;
export const MAX_TESTSUITE_DESCRIPTION_LENGTH = 2000;
/**
 * 耗时（分钟）上限：后端 TestSuiteCreateRequest/UpdateRequest 的
 * estimatedTime/actualTime 都是 Integer（codex r6 P2-8），超过
 * 2147483647 的值后端 Jackson 反序列化失败，前端必须拦截。
 */
export const MAX_TESTSUITE_MINUTES = 2147483647;

/** 空表单默认值：状态 DRAFT（草稿） */
export function emptyTestSuiteFormInput(): TestSuiteFormInput {
  return {
    suiteName: '',
    description: '',
    suiteType: '',
    status: 'DRAFT',
    priority: '',
    estimatedTime: '',
    actualTime: '',
  };
}

/** 由 TestSuiteResponse 回填编辑表单（统计字段/审计字段不进表单，不回填不写回） */
export function editFormFromTestSuite(detail: TestSuiteResponse): TestSuiteFormInput {
  return {
    suiteName: detail.suiteName ?? '',
    description: detail.description ?? '',
    suiteType: detail.suiteType ?? '',
    status: detail.status ?? 'DRAFT',
    priority: detail.priority ?? '',
    estimatedTime: detail.estimatedTime != null ? String(detail.estimatedTime) : '',
    actualTime: detail.actualTime != null ? String(detail.actualTime) : '',
  };
}

/** 字段级校验错误：调用方按 field 挂到对应输入下展示 */
export interface TestSuiteFormFieldError {
  field:
    | 'suiteName'
    | 'description'
    | 'suiteType'
    | 'status'
    | 'priority'
    | 'estimatedTime'
    | 'actualTime';
  message: string;
}

/**
 * 校验表单输入，返回字段级错误列表（空表示通过）。
 * originalEstimatedTime/originalActualTime 为编辑前耗时原始值
 * （initial.estimatedTime/initial.actualTime）：原有值被清空时按 testCase
 * estimatedDuration 同口径显式拒绝（"当前更新契约不支持清空…"），而不是
 * 静默保留原值。
 */
export function validateTestSuiteFormInput(
  input: TestSuiteFormInput,
  options: {
    originalEstimatedTime?: string | null;
    originalActualTime?: string | null;
  } = {},
): TestSuiteFormFieldError[] {
  const errors: TestSuiteFormFieldError[] = [];

  const suiteName = input.suiteName.trim();
  if (!suiteName) {
    errors.push({ field: 'suiteName', message: '套件名称不能为空' });
  } else if (suiteName.length < MIN_TESTSUITE_NAME_LENGTH) {
    errors.push({ field: 'suiteName', message: `套件名称至少${MIN_TESTSUITE_NAME_LENGTH}个字符` });
  } else if (suiteName.length > MAX_TESTSUITE_NAME_LENGTH) {
    errors.push({ field: 'suiteName', message: `套件名称不能超过${MAX_TESTSUITE_NAME_LENGTH}个字符` });
  }

  if (input.description.trim().length > MAX_TESTSUITE_DESCRIPTION_LENGTH) {
    errors.push({ field: 'description', message: `描述不能超过${MAX_TESTSUITE_DESCRIPTION_LENGTH}个字符` });
  }

  if (!input.suiteType.trim()) {
    errors.push({ field: 'suiteType', message: '套件类型不能为空' });
  } else if (!(TEST_SUITE_TYPES as readonly string[]).includes(input.suiteType)) {
    errors.push({ field: 'suiteType', message: '套件类型不在可选范围内' });
  }

  if (!input.status.trim()) {
    errors.push({ field: 'status', message: '状态不能为空' });
  } else if (!(TEST_SUITE_STATUSES as readonly string[]).includes(input.status)) {
    errors.push({ field: 'status', message: '状态不在可选范围内' });
  }

  if (!input.priority.trim()) {
    errors.push({ field: 'priority', message: '优先级不能为空' });
  } else if (!(TEST_SUITE_PRIORITIES as readonly string[]).includes(input.priority)) {
    errors.push({ field: 'priority', message: '优先级不在可选范围内' });
  }

  const checkMinutes = (
    field: 'estimatedTime' | 'actualTime',
    label: string,
    original: string | null | undefined,
  ) => {
    if (input[field].trim() !== '') {
      const minutes = parseOptionalPositiveInt(input[field]);
      if (minutes === null) {
        errors.push({ field, message: `${label}须为正整数（分钟）` });
      } else if (minutes > MAX_TESTSUITE_MINUTES) {
        // 后端为 Integer：超过 2147483647 反序列化失败（codex r6 P2-8）
        errors.push({ field, message: `${label}不能超过${MAX_TESTSUITE_MINUTES}分钟` });
      }
    } else if (original != null && original.trim() !== '') {
      // 后端更新只写非空值：编辑时清空已有耗时会静默保留原值，
      // 按 testCase estimatedDuration 同口径显式拒绝（codex r4 P2）
      errors.push({ field, message: `当前更新契约不支持清空${label}` });
    }
  };
  checkMinutes('estimatedTime', '预计耗时', options.originalEstimatedTime);
  checkMinutes('actualTime', '实际耗时', options.originalActualTime);

  return errors;
}

/**
 * 载荷用的空值归一化：TestSuiteCreatePayload/UpdatePayload 的可选字段为
 * `T | undefined`（不接受 null），空文本 → undefined（JSON 序列化时省略，
 * 后端只应用非空字段 = 保留原值）。与 testCase 域的 undefined 口径一致。
 */
const undefinedIfBlank = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const whiteList = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** 由表单输入构建 TestSuiteCreatePayload。调用前应先跑 validateTestSuiteFormInput */
export function buildTestSuiteCreatePayload(
  input: TestSuiteFormInput,
  projectId: number,
): TestSuiteCreatePayload {
  return {
    suiteName: input.suiteName.trim(),
    projectId,
    description: undefinedIfBlank(input.description),
    suiteType: whiteList(input.suiteType, TEST_SUITE_TYPES, '回归测试'),
    status: whiteList(input.status, TEST_SUITE_STATUSES, 'DRAFT' as TestSuiteStatus),
    priority: whiteList(input.priority, TEST_SUITE_PRIORITIES, '中' as TestSuitePriority),
    estimatedTime: parseOptionalPositiveInt(input.estimatedTime) ?? undefined,
    actualTime: parseOptionalPositiveInt(input.actualTime) ?? undefined,
  };
}

/**
 * 由编辑表单组装 POST /testSuite/v1/updateTestSuite 载荷（id 必传，字段级更新）。
 * - description：恒发送 trim 字符串（'' = 清空；后端 `Optional.ofNullable`
 *   非空即应用——codex r4 P2 口径：用户清空已有值必须真实清空）
 * - estimatedTime/actualTime：空白 → undefined（保留原值）；清空已有值由校验
 *   显式拒绝，不静默忽略
 * - 统计字段（totalCases/passedCases/…）与审计字段不由表单写回
 */
export function buildTestSuiteUpdatePayload(
  testSuiteId: number,
  input: TestSuiteFormInput,
): TestSuiteUpdatePayload {
  return {
    id: testSuiteId,
    suiteName: input.suiteName.trim(),
    // 恒发送 trim 字符串：'' = 清空（后端非空即应用）。
    // codex r4 P2：用户清空已有值时不能静默保留原值
    description: input.description.trim(),
    suiteType: whiteList(input.suiteType, TEST_SUITE_TYPES, '回归测试'),
    status: whiteList(input.status, TEST_SUITE_STATUSES, 'DRAFT' as TestSuiteStatus),
    priority: whiteList(input.priority, TEST_SUITE_PRIORITIES, '中' as TestSuitePriority),
    estimatedTime: parseOptionalPositiveInt(input.estimatedTime) ?? undefined,
    actualTime: parseOptionalPositiveInt(input.actualTime) ?? undefined,
  };
}
