/**
 * 版本新建/编辑表单的载荷构建与校验（P2：p2-version-slices）。
 *
 * 纯函数，可独立测试。契约忠实于后端 VersionCreateRequest / VersionUpdateRequest
 * 与老前端 VersionForm.vue 的校验口径：
 * - name 必填，2～100 字符；versionNumber 必填，1～50 字符
 * - description ≤2000 字符（老前端 blur 口径）
 * - versionType 必填（四个前端常量，主版本/次版本/补丁版本/预发布版本；
 *   后端为 String 不做白名单校验）
 * - plannedEndDate 不能早于 plannedStartDate（老前端日精度口径）
 * - 日期用 'YYYY-MM-DDTHH:mm:ss' 字符串（LocalDateTime 序列化口径）；
 *   非空日期必须形如 YYYY-MM-DD 或带 T 的时间串且为合法日期
 *
 * 更新载荷沿用缺陷编辑的 null-skip 语义（lib/defect-detail.ts），但以前端
 * 契约测试的"局部更新"口径实现：空白的可选字段在载荷里**省略**（undefined，
 * JSON 序列化时丢弃）而非显式 null；后端 BaseVersionUpdater 只更新非 null
 * 字段，Java 侧缺失字段反序列化为 null = 保留原值、不清空。契约测试
 * contract.test.ts（updateVersion 单字段更新）断言的正是 {id, description}
 * 的省略形态。
 * - assigneeId：空白 → 省略（保留原值）；非法输入由调用方先拦截
 * - name/versionNumber/versionType 为必填，trim 后发送
 */
import type {
  VersionCreatePayload,
  VersionResponse,
  VersionType,
  VersionUpdatePayload,
} from './api/version-types';
import { VERSION_TYPES } from './api/version-types';
import { parseOptionalPositiveInt } from './task-create';

/** 版本表单原始输入（均为受控组件的字符串值） */
export interface VersionFormInput {
  name: string;
  versionNumber: string;
  description: string;
  versionType: string;
  assigneeId: string;
  plannedStartDate: string;
  plannedEndDate: string;
  plannedReleaseDate: string;
  tags: string;
}

/** 空表单默认值：versionType 默认为"次版本"（与老前端 VersionForm 默认一致） */
export function emptyVersionFormInput(): VersionFormInput {
  return {
    name: '',
    versionNumber: '',
    description: '',
    versionType: '次版本',
    assigneeId: '',
    plannedStartDate: '',
    plannedEndDate: '',
    plannedReleaseDate: '',
    tags: '',
  };
}

/** 由 VersionResponse 回填编辑表单 */
export function editFormFromVersion(detail: VersionResponse): VersionFormInput {
  return {
    name: detail.name ?? '',
    versionNumber: detail.versionNumber ?? '',
    description: detail.description ?? '',
    versionType: detail.versionType ?? '次版本',
    assigneeId: detail.assigneeId != null ? String(detail.assigneeId) : '',
    plannedStartDate: detail.plannedStartDate ?? '',
    plannedEndDate: detail.plannedEndDate ?? '',
    plannedReleaseDate: detail.plannedReleaseDate ?? '',
    tags: detail.tags ?? '',
  };
}

/** 版本名称上限：老前端 VersionForm 口径 2～100 */
export const VERSION_NAME_MIN_LENGTH = 2;
export const VERSION_NAME_MAX_LENGTH = 100;
/** 版本号上限：老前端 VersionForm 口径 1～50 */
export const VERSION_NUMBER_MAX_LENGTH = 50;
/** 版本描述上限：老前端 VersionForm 口径 ≤2000 */
export const VERSION_DESCRIPTION_MAX_LENGTH = 2000;

/** 字段级校验错误：调用方按 field 挂到对应输入下展示 */
export interface VersionFormFieldError {
  field:
    | 'name'
    | 'versionNumber'
    | 'description'
    | 'versionType'
    | 'assigneeId'
    | 'plannedStartDate'
    | 'plannedEndDate'
    | 'plannedReleaseDate';
  message: string;
}

/**
 * 宽松的 LocalDateTime 输入校验：空 → 通过（可选字段）；
 * 非空 → 必须形如 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss（允许秒缺省）且为真实日期。
 * 后端为 LocalDateTime 反序列化，非法串会 400；这里前置拦截，避免脏请求。
 */
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function isValidDateTimeInput(value: string): boolean {
  const match = DATE_TIME_PATTERN.exec(value.trim());
  if (!match) return false;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return (
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day) &&
    date.getHours() === Number(hour) &&
    date.getMinutes() === Number(minute) &&
    date.getSeconds() === Number(second)
  );
}

/** 日精度比较：end >= start（老前端 VersionForm 用 isBefore(..., 'day') 口径） */
function isEndBeforeStart(start: string, end: string): boolean {
  const dayOf = (value: string) => value.trim().slice(0, 10);
  return dayOf(end) < dayOf(start);
}

/**
 * 校验表单输入，返回字段级错误列表（收集全部错误，不首错即停；空表示通过）。
 * 日期非法时不再做日期前后比较（避免一条非法输入同时报两条错）。
 */
export function validateVersionFormInput(input: VersionFormInput): VersionFormFieldError[] {
  const errors: VersionFormFieldError[] = [];
  const name = input.name.trim();
  if (!name) {
    errors.push({ field: 'name', message: '版本名称不能为空' });
  } else if (name.length < VERSION_NAME_MIN_LENGTH || name.length > VERSION_NAME_MAX_LENGTH) {
    errors.push({
      field: 'name',
      message: `版本名称长度应为 ${VERSION_NAME_MIN_LENGTH} 到 ${VERSION_NAME_MAX_LENGTH} 个字符`,
    });
  }
  const versionNumber = input.versionNumber.trim();
  if (!versionNumber) {
    errors.push({ field: 'versionNumber', message: '版本号不能为空' });
  } else if (versionNumber.length > VERSION_NUMBER_MAX_LENGTH) {
    errors.push({
      field: 'versionNumber',
      message: `版本号长度不能超过 ${VERSION_NUMBER_MAX_LENGTH} 个字符`,
    });
  }
  if (input.description.trim().length > VERSION_DESCRIPTION_MAX_LENGTH) {
    errors.push({
      field: 'description',
      message: `版本描述不能超过 ${VERSION_DESCRIPTION_MAX_LENGTH} 个字符`,
    });
  }
  if (!(VERSION_TYPES as readonly string[]).includes(input.versionType)) {
    errors.push({ field: 'versionType', message: '请选择版本类型' });
  }
  if (input.assigneeId.trim() !== '' && parseOptionalPositiveInt(input.assigneeId) == null) {
    errors.push({ field: 'assigneeId', message: '负责人用户 ID 格式非法，请输入正整数或留空' });
  }
  let startValid = true;
  let endValid = true;
  if (input.plannedStartDate.trim() !== '' && !isValidDateTimeInput(input.plannedStartDate)) {
    errors.push({
      field: 'plannedStartDate',
      message: '日期格式非法，请用 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss',
    });
    startValid = false;
  }
  if (input.plannedEndDate.trim() !== '' && !isValidDateTimeInput(input.plannedEndDate)) {
    errors.push({
      field: 'plannedEndDate',
      message: '日期格式非法，请用 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss',
    });
    endValid = false;
  }
  if (input.plannedReleaseDate.trim() !== '' && !isValidDateTimeInput(input.plannedReleaseDate)) {
    errors.push({
      field: 'plannedReleaseDate',
      message: '日期格式非法，请用 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss',
    });
  }
  if (
    startValid &&
    endValid &&
    input.plannedStartDate.trim() !== '' &&
    input.plannedEndDate.trim() !== '' &&
    isEndBeforeStart(input.plannedStartDate, input.plannedEndDate)
  ) {
    errors.push({ field: 'plannedEndDate', message: '计划结束日期不能早于计划开始日期' });
  }
  return errors;
}

const nullIfBlank = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/** 由表单输入构建 VersionCreatePayload。调用前应先跑 validateVersionFormInput。 */
export function buildVersionCreatePayload(
  input: VersionFormInput,
  projectId: number,
): VersionCreatePayload {
  return {
    projectId,
    name: input.name.trim(),
    versionNumber: input.versionNumber.trim(),
    description: nullIfBlank(input.description) ?? '',
    versionType: (VERSION_TYPES as readonly string[]).includes(input.versionType)
      ? (input.versionType as VersionType)
      : '次版本',
    assigneeId: parseOptionalPositiveInt(input.assigneeId) ?? undefined,
    plannedStartDate: nullIfBlank(input.plannedStartDate) ?? undefined,
    plannedEndDate: nullIfBlank(input.plannedEndDate) ?? undefined,
    plannedReleaseDate: nullIfBlank(input.plannedReleaseDate) ?? undefined,
    tags: nullIfBlank(input.tags) ?? undefined,
  };
}

const undefinedIfBlank = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * 由表单输入构建 VersionUpdatePayload（字段级更新）。
 * 空白的可选字段省略（undefined，JSON 序列化时丢弃）= 保留原值
 * （后端 BaseVersionUpdater 只更新非 null 字段）；
 * 项目归属 projectId 不允许变更，故不出现在更新载荷中。
 */
export function buildVersionUpdatePayload(
  versionId: number,
  input: VersionFormInput,
): VersionUpdatePayload {
  return {
    id: versionId,
    name: input.name.trim(),
    versionNumber: input.versionNumber.trim(),
    description: undefinedIfBlank(input.description),
    versionType: (VERSION_TYPES as readonly string[]).includes(input.versionType)
      ? (input.versionType as VersionType)
      : undefined,
    assigneeId: parseOptionalPositiveInt(input.assigneeId) ?? undefined,
    plannedStartDate: undefinedIfBlank(input.plannedStartDate),
    plannedEndDate: undefinedIfBlank(input.plannedEndDate),
    plannedReleaseDate: undefinedIfBlank(input.plannedReleaseDate),
    tags: undefinedIfBlank(input.tags),
  };
}
