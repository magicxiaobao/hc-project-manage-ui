/**
 * 发布草稿/门禁/审批/结果记录表单的载荷构建与校验（P2：p2-release-lifecycle）。
 *
 * 纯函数，可独立测试。契约忠实于后端 ReleaseController（release/v1）
 * 与老前端 ReleaseDraft.vue / ReleaseDraftActionPanel.vue /
 * ReleaseApprovalPanel.vue / ReleaseArtifactPanel.vue /
 * ReleaseLifecycleActionPanel.vue 的校验口径：
 * - create：versionId + environmentId 必填；environmentId 必须落在项目可用
 *   （ACTIVE）环境集合内（老前端 activeEnvironments）；可选字段空白即省略；
 *   idempotencyKey 由调用方每次新建表单时生成（crypto.randomUUID）
 * - updateDraft：整包覆盖（省略字段即写 null，forceUpdate 省略回退 false），
 *   所以 build 时空白文本字段**省略 key**（≠ 送空串）；回填时 null → ''
 * - waiveGate/revokeWaiver：{ gateType, reason }，reason 必填
 * - approve/reject/cancel：{ reason }，reason 必填（后端 ReleaseReasonRequest）
 * - recordReleased：buildNumber/artifactLocation/fileHash 必填非空白；
 *   fileSize 可选，非空则必须为非负整数（Java Long 口径）；resultNotes 可选
 * - recordFailed：resultNotes 必填；证据二分支——附带证据时三件套必填
 *   （fileSize 可选≥0），不附带时四个证据字段一律省略（联合类型 ?:never
 *   分支）；半套直接拒绝（忠实后端 ReleaseEvidenceInvalid）
 */
import type {
  ReleaseCreatePayload,
  ReleaseDraftUpdatePayload,
  ReleaseFailurePayload,
  ReleaseGateType,
  ReleaseResponse,
  ReleaseSuccessPayload,
} from './api/release-types';
import { RELEASE_GATE_TYPES } from './api/release-types';

/** 字段级校验错误：调用方按 field 挂到对应输入下展示 */
export interface ReleaseFormFieldError {
  field: string;
  message: string;
}

const blankToUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/** 非负整数（Java Long 口径）：返回解析值；非法时返回 null（调用方挂字段错误） */
export function parseNonNegativeLong(text: string): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = BigInt(trimmed);
  if (value > 9223372036854775807n) return null;
  return value;
}

/* ================= 草稿新建 ================= */

/** 发布草稿新建表单原始输入（受控组件值） */
export interface ReleaseDraftCreateInput {
  /** 发布环境：受控字符串输入，"" = 未选；提交前解析为正整数 */
  environmentId: string;
  releaseNotes: string;
  changelog: string;
  rollbackPlan: string;
  knownIssues: string;
  forceUpdate: boolean;
  compatibility: string;
  dependencies: string;
}

/** 空表单默认值（老前端 ReleaseDraft.vue form 一致） */
export function emptyReleaseDraftCreateInput(): ReleaseDraftCreateInput {
  return {
    environmentId: '',
    releaseNotes: '',
    changelog: '',
    rollbackPlan: '',
    knownIssues: '',
    forceUpdate: false,
    compatibility: '',
    dependencies: '',
  };
}

/**
 * 校验新建表单输入，返回字段级错误列表（收集全部，不首错即停）。
 *
 * @param input 表单输入
 * @param activeEnvironmentIds 项目可用（ACTIVE）环境 id 集合；创建前环境
 *   必须落在该集合内（老前端 activeEnvironments 口径）
 */
export function validateReleaseDraftCreateInput(
  input: ReleaseDraftCreateInput,
  activeEnvironmentIds: readonly number[],
): ReleaseFormFieldError[] {
  const errors: ReleaseFormFieldError[] = [];
  const environmentId = Number.parseInt(input.environmentId, 10);
  if (input.environmentId.trim() === '') {
    errors.push({ field: 'environmentId', message: '请选择发布环境' });
  } else if (!Number.isSafeInteger(environmentId) || environmentId <= 0) {
    errors.push({ field: 'environmentId', message: '发布环境不合法' });
  } else if (!activeEnvironmentIds.includes(environmentId)) {
    errors.push({ field: 'environmentId', message: '所选环境不可用或已停用' });
  }
  return errors;
}

/** 由表单输入构建 ReleaseCreatePayload。调用前应先跑校验。 */
export function buildReleaseCreatePayload(
  input: ReleaseDraftCreateInput,
  versionId: number,
): ReleaseCreatePayload {
  return {
    versionId,
    environmentId: Number.parseInt(input.environmentId, 10),
    idempotencyKey: crypto.randomUUID(),
    releaseNotes: blankToUndefined(input.releaseNotes),
    changelog: blankToUndefined(input.changelog),
    rollbackPlan: blankToUndefined(input.rollbackPlan),
    knownIssues: blankToUndefined(input.knownIssues),
    forceUpdate: input.forceUpdate,
    compatibility: blankToUndefined(input.compatibility),
    dependencies: blankToUndefined(input.dependencies),
  };
}

/* ================= 草稿编辑（整包覆盖） ================= */

/** 发布草稿编辑表单原始输入（受控组件值） */
export interface ReleaseDraftEditInput {
  releaseNotes: string;
  changelog: string;
  rollbackPlan: string;
  knownIssues: string;
  forceUpdate: boolean;
  compatibility: string;
  dependencies: string;
  /** 管理员原因（代他人修改/删除时填写）：可选 */
  adminReason: string;
}

const nullToEmpty = (value: string | null | undefined): string => value ?? '';

/** 由 ReleaseResponse 回填编辑表单（整包覆盖：回填即承诺送出全部字段） */
export function editDraftFormFromRelease(
  release: ReleaseResponse,
): ReleaseDraftEditInput {
  return {
    releaseNotes: nullToEmpty(release.releaseNotes),
    changelog: nullToEmpty(release.changelog),
    rollbackPlan: nullToEmpty(release.rollbackPlan),
    knownIssues: nullToEmpty(release.knownIssues),
    forceUpdate: release.forceUpdate ?? false,
    compatibility: nullToEmpty(release.compatibility),
    dependencies: nullToEmpty(release.dependencies),
    adminReason: '',
  };
}

/** 空编辑表单（未加载详情时用不到，仅供测试） */
export function emptyReleaseDraftEditInput(): ReleaseDraftEditInput {
  return {
    releaseNotes: '',
    changelog: '',
    rollbackPlan: '',
    knownIssues: '',
    forceUpdate: false,
    compatibility: '',
    dependencies: '',
    adminReason: '',
  };
}

/**
 * 由编辑表单构建 ReleaseDraftUpdatePayload。
 *
 * 整包覆盖语义（后端 ReleaseDraftService.updateDraft →
 * ReleaseRepository.updateDraft）：空白文本字段**省略 key**（后端写 null，
 * 而不是空串）；forceUpdate 按开关值送出；adminReason 空白省略。
 * 调用前无需额外校验（各字段均可选）。
 */
export function buildReleaseDraftUpdatePayload(
  id: number,
  input: ReleaseDraftEditInput,
): ReleaseDraftUpdatePayload {
  const payload: ReleaseDraftUpdatePayload = {
    id,
    forceUpdate: input.forceUpdate,
  };
  const textFields: Array<
    keyof Omit<ReleaseDraftUpdatePayload, 'id' | 'forceUpdate' | 'adminReason'>
  > = [
    'releaseNotes',
    'changelog',
    'rollbackPlan',
    'knownIssues',
    'compatibility',
    'dependencies',
  ];
  for (const field of textFields) {
    const value = blankToUndefined(input[field]);
    if (value !== undefined) {
      payload[field] = value;
    }
  }
  const adminReason = blankToUndefined(input.adminReason);
  if (adminReason !== undefined) {
    payload.adminReason = adminReason;
  }
  return payload;
}

/* ================= 门禁豁免 ================= */

/** 门禁豁免/撤销豁免表单输入 */
export interface ReleaseWaiverInput {
  gateType: string;
  reason: string;
}

export function emptyReleaseWaiverInput(): ReleaseWaiverInput {
  return { gateType: RELEASE_GATE_TYPES[0], reason: '' };
}

/** 校验豁免表单：门禁类型必须为五项之一，原因必填 */
export function validateReleaseWaiverInput(
  input: ReleaseWaiverInput,
): ReleaseFormFieldError[] {
  const errors: ReleaseFormFieldError[] = [];
  if (!(RELEASE_GATE_TYPES as readonly string[]).includes(input.gateType)) {
    errors.push({ field: 'gateType', message: '门禁类型不合法' });
  }
  if (input.reason.trim() === '') {
    errors.push({ field: 'reason', message: '请填写豁免原因' });
  }
  return errors;
}

export function buildReleaseWaiverPayload(input: ReleaseWaiverInput): {
  gateType: ReleaseGateType;
  reason: string;
} {
  return { gateType: input.gateType as ReleaseGateType, reason: input.reason.trim() };
}

/* ================= 审批原因（approve/reject/cancel 共用） ================= */

/** 校验原因：非空（trim 后） */
export function validateReleaseReasonInput(
  reason: string,
  field = 'reason',
): ReleaseFormFieldError[] {
  return reason.trim() === ''
    ? [{ field, message: '请填写原因' }]
    : [];
}

/* ================= 结果记录 ================= */

/** 结果记录表单原始输入（released/failed 共用） */
export interface ReleaseRecordResultInput {
  buildNumber: string;
  artifactLocation: string;
  /** 文件大小：受控字符串输入，空白 = 省略；提交前解析为非负整数 */
  fileSize: string;
  fileHash: string;
  resultNotes: string;
  /** failed 模式下是否附带制品证据；released 模式恒视为 true */
  includeEvidence: boolean;
}

export function emptyReleaseRecordResultInput(): ReleaseRecordResultInput {
  return {
    buildNumber: '',
    artifactLocation: '',
    fileSize: '',
    fileHash: '',
    resultNotes: '',
    includeEvidence: false,
  };
}

function validateArtifactTrio(input: ReleaseRecordResultInput): ReleaseFormFieldError[] {
  const errors: ReleaseFormFieldError[] = [];
  if (input.buildNumber.trim() === '') {
    errors.push({ field: 'buildNumber', message: '请填写构建号' });
  }
  if (input.artifactLocation.trim() === '') {
    errors.push({ field: 'artifactLocation', message: '请填写制品位置' });
  }
  if (input.fileHash.trim() === '') {
    errors.push({ field: 'fileHash', message: '请填写文件哈希' });
  }
  return errors;
}

function validateFileSize(input: ReleaseRecordResultInput): ReleaseFormFieldError[] {
  if (input.fileSize.trim() === '') return [];
  return parseNonNegativeLong(input.fileSize) === null
    ? [{ field: 'fileSize', message: '文件大小必须为非负整数' }]
    : [];
}

/**
 * 校验结果记录表单（收集全部错误）：
 * - released：构建号/制品位置/文件哈希必填非空白；fileSize 可选≥0；
 *   resultNotes 可选
 * - failed：resultNotes 必填；附带证据（includeEvidence）时三件套必填、
 *   fileSize 可选≥0；不附带时证据字段一律不校验（构建时省略）
 */
export function validateReleaseRecordResultInput(
  input: ReleaseRecordResultInput,
  mode: 'released' | 'failed',
): ReleaseFormFieldError[] {
  const errors: ReleaseFormFieldError[] = [];
  const needsEvidence = mode === 'released' || input.includeEvidence;
  if (mode === 'failed' && input.resultNotes.trim() === '') {
    errors.push({ field: 'resultNotes', message: '请填写结果说明' });
  }
  if (needsEvidence) {
    errors.push(...validateArtifactTrio(input));
    errors.push(...validateFileSize(input));
  }
  return errors;
}

/** 解析可选文件大小：空白 → undefined；调用前应先跑校验 */
function optionalFileSize(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  return Number(parseNonNegativeLong(text));
}

/** 由表单输入构建 ReleaseSuccessPayload。调用前应先跑校验。 */
export function buildReleaseSuccessPayload(
  input: ReleaseRecordResultInput,
): ReleaseSuccessPayload {
  return {
    buildNumber: input.buildNumber.trim(),
    artifactLocation: input.artifactLocation.trim(),
    fileSize: optionalFileSize(input.fileSize),
    fileHash: input.fileHash.trim(),
    resultNotes: blankToUndefined(input.resultNotes),
  };
}

/**
 * 由表单输入构建 ReleaseFailurePayload。调用前应先跑校验。
 * - 不附带证据：仅 { resultNotes }（四个证据字段省略，走联合类型的无证据分支）
 * - 附带证据：三件套 + 可选 fileSize + resultNotes（有证据分支）
 */
export function buildReleaseFailurePayload(
  input: ReleaseRecordResultInput,
): ReleaseFailurePayload {
  const resultNotes = input.resultNotes.trim();
  if (!input.includeEvidence) {
    return { resultNotes };
  }
  return {
    resultNotes,
    buildNumber: input.buildNumber.trim(),
    artifactLocation: input.artifactLocation.trim(),
    fileSize: optionalFileSize(input.fileSize),
    fileHash: input.fileHash.trim(),
  };
}
