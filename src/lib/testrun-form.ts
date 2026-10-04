/**
 * 测试轮/执行工作台表单纯函数（P2：p2-testrun-workspace）。
 *
 * 校验规则全部忠实于后端（TestRunCommandServiceImpl / TestExecutionCommandServiceImpl /
 * ExecutionDefectApplicationServiceImpl，只读核对）与老前端 forms：
 * - runName：trim 后 1–200（必填）；environment：最多 255（可选）
 * - FULL_REGRESSION：versionId 必须为正数（必填）
 * - AD_HOC：套件/用例选择去重后合计 1–200 项（后端 SELECTION_LIMIT=200）
 * - TARGETED_RETEST：sourceRunId 正数必填；sourceRunCaseIds 去重后 1–200
 * - 完成执行：result 必填；FAILED/BLOCKED → failureMessage 必填；
 *   PASSED → failureMessage 必须为空（后端直接拒绝）；SKIPPED → executionNotes 必填；
 *   overrideReason 最多 500
 * - 重试执行/取消轮：reason trim 后 1–500（必填）
 * - 执行建缺陷：title 按码点 1–200（必填，老前端 ExecutionDefectDialog 口径）；
 *   关联已有缺陷：defectId 正整数必填
 *
 * 校验函数返回 {field, message}[]：收集全部错误（不首错即停），调用方把错误
 * 挂到对应字段下（FieldError），用户编辑该字段时清除其错误。
 */
import { parseIdListText } from './defect-create';
import { parseRequiredPositiveInt } from './task-create';
import type { DefectPriority, DefectSeverity } from './api/defect-types';
import type {
  CompleteExecutionPayload,
  CreateExecutionDefectPayload,
  LinkExistingDefectPayload,
} from './api/testExecution-types';
import type {
  AdHocRunSelection,
  CreateAdHocRunPayload,
  CreateFullRegressionPayload,
  CreateTargetedRetestPayload,
  TestExecutionResult,
  TestRunType,
} from './api/testRun-types';

export interface FieldIssue {
  field: string;
  message: string;
}

/** 建轮表单输入（三种模式共用；文本框输入保持字符串形态，提交时解析） */
export interface TestRunCreateInput {
  runType: TestRunType;
  runName: string;
  environment: string;
  /** FULL_REGRESSION：版本 ID（老前端为直接输入数字，与此处一致） */
  versionId: string;
  /** AD_HOC：逗号分隔的套件 ID 列表 */
  adHocSuiteIds: string;
  /** AD_HOC：逗号分隔的用例 ID 列表 */
  adHocCaseIds: string;
  /** TARGETED_RETEST：来源轮 ID */
  sourceRunId: string;
  /** TARGETED_RETEST：逗号分隔的来源轮用例（runCase）ID 列表 */
  sourceRunCaseIds: string;
}

export function emptyTestRunCreateInput(runType: TestRunType): TestRunCreateInput {
  return {
    runType,
    runName: '',
    environment: '',
    versionId: '',
    adHocSuiteIds: '',
    adHocCaseIds: '',
    sourceRunId: '',
    sourceRunCaseIds: '',
  };
}

/** 公共文本校验：runName 必填 1–200，environment 最多 255 */
function validateCommonText(input: TestRunCreateInput): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const name = input.runName.trim();
  if (!name) {
    issues.push({ field: 'runName', message: '运行名称为必填项（1–200 个字符）' });
  } else if (Array.from(name).length > 200) {
    issues.push({ field: 'runName', message: '运行名称最多 200 个字符' });
  }
  if (input.environment.trim() && Array.from(input.environment.trim()).length > 255) {
    issues.push({ field: 'environment', message: '环境最多 255 个字符' });
  }
  return issues;
}

/** 建轮表单校验：收集全部错误，不首错即停 */
export function validateTestRunCreateInput(input: TestRunCreateInput): FieldIssue[] {
  const issues = validateCommonText(input);
  if (input.runType === 'FULL_REGRESSION') {
    if (parseRequiredPositiveInt(input.versionId.trim()) === null) {
      issues.push({ field: 'versionId', message: '版本 ID 为必填项，请输入正整数' });
    }
  } else if (input.runType === 'AD_HOC') {
    const suites = parseIdListText(input.adHocSuiteIds);
    const cases = parseIdListText(input.adHocCaseIds);
    const invalidTokens = [...suites.invalid, ...cases.invalid];
    if (invalidTokens.length > 0) {
      issues.push({
        field: 'adHocSuiteIds',
        message: `存在非法 ID：${[...new Set(invalidTokens)].join('、')}`,
      });
    } else {
      const total = new Set(suites.ids).size + new Set(cases.ids).size;
      if (total < 1) {
        issues.push({
          field: 'adHocSuiteIds',
          message: '临时验证至少选择 1 个测试套件或测试用例',
        });
      } else if (total > 200) {
        issues.push({
          field: 'adHocSuiteIds',
          message: '套件与用例选择合计最多 200 项（已去重）',
        });
      }
    }
  } else {
    // TARGETED_RETEST
    if (parseRequiredPositiveInt(input.sourceRunId.trim()) === null) {
      issues.push({ field: 'sourceRunId', message: '来源测试轮 ID 为必填项，请输入正整数' });
    }
    const parsed = parseIdListText(input.sourceRunCaseIds);
    if (parsed.invalid.length > 0) {
      issues.push({
        field: 'sourceRunCaseIds',
        message: `存在非法 ID：${[...new Set(parsed.invalid)].join('、')}`,
      });
    } else {
      const total = new Set(parsed.ids).size;
      if (total < 1) {
        issues.push({
          field: 'sourceRunCaseIds',
          message: '至少选择 1 个来源轮用例（用其轮内用例 ID）',
        });
      } else if (total > 200) {
        issues.push({
          field: 'sourceRunCaseIds',
          message: '来源用例最多选择 200 项（已去重）',
        });
      }
    }
  }
  return issues;
}

export function buildFullRegressionPayload(
  input: TestRunCreateInput,
): CreateFullRegressionPayload {
  const payload: CreateFullRegressionPayload = {
    versionId: parseRequiredPositiveInt(input.versionId.trim()) as number,
    runName: input.runName.trim(),
  };
  const environment = input.environment.trim();
  if (environment) payload.environment = environment;
  return payload;
}

export function buildAdHocPayload(
  input: TestRunCreateInput,
  projectId: number,
): CreateAdHocRunPayload {
  const selections: AdHocRunSelection[] = [
    ...new Set(parseIdListText(input.adHocSuiteIds).ids).values(),
  ].map((id) => ({ selectionType: 'TEST_SUITE' as const, id }));
  for (const id of new Set(parseIdListText(input.adHocCaseIds).ids)) {
    selections.push({ selectionType: 'TEST_CASE' as const, id });
  }
  const payload: CreateAdHocRunPayload = {
    projectId,
    runName: input.runName.trim(),
    selections,
  };
  const environment = input.environment.trim();
  if (environment) payload.environment = environment;
  return payload;
}

export function buildTargetedRetestPayload(
  input: TestRunCreateInput,
): CreateTargetedRetestPayload {
  const payload: CreateTargetedRetestPayload = {
    sourceRunId: parseRequiredPositiveInt(input.sourceRunId.trim()) as number,
    sourceRunCaseIds: [...new Set(parseIdListText(input.sourceRunCaseIds).ids)],
    runName: input.runName.trim(),
  };
  const environment = input.environment.trim();
  if (environment) payload.environment = environment;
  return payload;
}

/** 完成执行表单输入（result 空字符串=未选择） */
export interface ExecutionCompleteInput {
  result: '' | TestExecutionResult;
  actualResult: string;
  failureMessage: string;
  executionNotes: string;
  overrideReason: string;
}

export function emptyExecutionCompleteInput(): ExecutionCompleteInput {
  return {
    result: '',
    actualResult: '',
    failureMessage: '',
    executionNotes: '',
    overrideReason: '',
  };
}

/** 完成执行校验：忠实后端 completeValidation 三段规则 */
export function validateExecutionCompleteInput(
  input: ExecutionCompleteInput,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!input.result) {
    issues.push({ field: 'result', message: '执行结果为必填项' });
    return issues;
  }
  const failureMessage = input.failureMessage.trim();
  const executionNotes = input.executionNotes.trim();
  if (input.result === 'FAILED' || input.result === 'BLOCKED') {
    if (!failureMessage) {
      issues.push({
        field: 'failureMessage',
        message: '结果为失败/阻塞时必须填写失败说明',
      });
    }
  }
  if (input.result === 'PASSED' && failureMessage) {
    issues.push({
      field: 'failureMessage',
      message: '结果为通过时不应填写失败说明（后端会直接拒绝）',
    });
  }
  if (input.result === 'SKIPPED' && !executionNotes) {
    issues.push({
      field: 'executionNotes',
      message: '结果为跳过时必须填写执行备注',
    });
  }
  if (input.overrideReason.trim() && Array.from(input.overrideReason.trim()).length > 500) {
    issues.push({ field: 'overrideReason', message: '覆盖原因最多 500 个字符' });
  }
  return issues;
}

export function buildCompleteExecutionPayload(
  input: ExecutionCompleteInput,
): CompleteExecutionPayload {
  const payload: CompleteExecutionPayload = {
    result: input.result as TestExecutionResult,
  };
  const actualResult = input.actualResult.trim();
  const failureMessage = input.failureMessage.trim();
  const executionNotes = input.executionNotes.trim();
  const overrideReason = input.overrideReason.trim();
  if (actualResult) payload.actualResult = actualResult;
  if (failureMessage) payload.failureMessage = failureMessage;
  if (executionNotes) payload.executionNotes = executionNotes;
  if (overrideReason) payload.overrideReason = overrideReason;
  return payload;
}

/**
 * 原因字段校验（取消轮 / 重试执行共用）：trim 后 1–500 必填，
 * 忠实后端 requireReason（服务端同样 trim 并限制 500）。
 */
export function validateReasonField(reason: string): FieldIssue[] {
  const normalized = reason.trim();
  if (!normalized) {
    return [{ field: 'reason', message: '原因为必填项（1–500 个字符）' }];
  }
  if (Array.from(normalized).length > 500) {
    return [{ field: 'reason', message: '原因最多 500 个字符' }];
  }
  return [];
}

/** 执行中建缺陷/关联缺陷表单输入（复用缺陷域枚举类型，不重造） */
export interface ExecutionDefectInput {
  mode: 'create' | 'link';
  defectId: string;
  title: string;
  description: string;
  defectType: string;
  severity: DefectSeverity;
  priority: DefectPriority;
  reproductionSteps: string;
  expectedResult: string;
  actualResult: string;
}

export function emptyExecutionDefectInput(): ExecutionDefectInput {
  return {
    mode: 'create',
    defectId: '',
    title: '',
    description: '',
    defectType: '功能缺陷',
    severity: 'MAJOR',
    priority: 'MEDIUM',
    reproductionSteps: '',
    expectedResult: '',
    actualResult: '',
  };
}

export function validateExecutionDefectInput(
  input: ExecutionDefectInput,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (input.mode === 'link') {
    if (parseRequiredPositiveInt(input.defectId.trim()) === null) {
      issues.push({ field: 'defectId', message: '缺陷 ID 为必填项，请输入正整数' });
    }
    return issues;
  }
  const title = input.title.trim();
  const titleLength = Array.from(title).length;
  if (titleLength < 1) {
    issues.push({ field: 'title', message: '缺陷标题为必填项（1–200 个字符）' });
  } else if (titleLength > 200) {
    issues.push({ field: 'title', message: '缺陷标题最多 200 个字符' });
  }
  return issues;
}

export function buildCreateExecutionDefectPayload(
  input: ExecutionDefectInput,
): CreateExecutionDefectPayload {
  const payload: CreateExecutionDefectPayload = {
    title: input.title.trim(),
    severity: input.severity,
    priority: input.priority,
  };
  const description = input.description.trim();
  if (description) payload.description = description;
  const defectType = input.defectType.trim();
  if (defectType) payload.defectType = defectType;
  const reproductionSteps = input.reproductionSteps.trim();
  if (reproductionSteps) payload.reproductionSteps = reproductionSteps;
  const expectedResult = input.expectedResult.trim();
  if (expectedResult) payload.expectedResult = expectedResult;
  const actualResult = input.actualResult.trim();
  if (actualResult) payload.actualResult = actualResult;
  return payload;
}

export function buildLinkExistingDefectPayload(
  input: ExecutionDefectInput,
): LinkExistingDefectPayload {
  return {
    defectId: parseRequiredPositiveInt(input.defectId.trim()) as number,
  };
}
