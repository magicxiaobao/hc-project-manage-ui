/**
 * 发布环境新建/编辑表单的载荷构建与校验（P2：p2-release-env）。
 *
 * 纯函数，可独立测试。契约忠实于后端 ReleaseEnvironmentController
 *（release-environment/v1）/ ReleaseEnvironmentService 与老前端
 * ReleaseEnvironmentForm.vue 的校验口径：
 * - create 请求体：{projectId, name, category, order, approvalRequired}；
 *   name 非空且 ≤100 码点；category 必填（四类）；order 可空（后端缺省 0），
 *   非空则必须 ≥0；PRODUCTION 类别的 approvalRequired 被后端强制为 true
 * - update 请求体：{id, name, order, approvalRequired?}；name/order 必填
 *   （name 非空且 ≤100 码点、order ≥0），category 不可改；
 *   approvalRequired 随环境状态：ACTIVE 环境必填，INACTIVE 环境必须省略
 *   （错位同样抛 ReleaseEnvironmentInvalid）
 * - disable 请求体：{reason}；reason strip 后非空且 ≤500 码点；仅 ACTIVE
 *   环境可停用；存在在途发布时后端拒绝
 * - 响应 JSON 的排序字段名为 `order`（record 组件名；后端实体内部为 displayOrder）
 *
 * 前端硬约束（任务书）：order 表单必填、非负整数、上限 2147483647（Java int
 * 上限），超限挂字段错误；原因/名称长度按 Unicode 码点计数
 *（Array.from().length），与后端 codePointCount 口径一致。
 */
import type {
  ReleaseEnvironmentCategory,
  ReleaseEnvironmentCreatePayload,
  ReleaseEnvironmentResponse,
  ReleaseEnvironmentStatus,
  ReleaseEnvironmentUpdatePayload,
} from './api/releaseEnvironment-types';
import { RELEASE_ENVIRONMENT_CATEGORIES } from './api/releaseEnvironment-types';

/** 发布环境表单原始输入（受控组件值） */
export interface ReleaseEnvironmentFormInput {
  name: string;
  category: string;
  /** 排序：受控字符串输入，提交前解析为非负整数 */
  order: string;
  approvalRequired: boolean;
}

/** 空表单默认值：类别默认为开发环境（与老前端 ReleaseEnvironmentForm 一致） */
export function emptyEnvironmentFormInput(): ReleaseEnvironmentFormInput {
  return {
    name: '',
    category: 'DEVELOPMENT',
    order: '0',
    approvalRequired: false,
  };
}

/** 由 ReleaseEnvironmentResponse 回填编辑表单 */
export function editFormFromEnvironment(
  environment: ReleaseEnvironmentResponse,
): ReleaseEnvironmentFormInput {
  return {
    name: environment.name ?? '',
    category: environment.category ?? 'DEVELOPMENT',
    order: environment.order != null ? String(environment.order) : '0',
    approvalRequired: environment.approvalRequired ?? false,
  };
}

/** 环境名称上限：后端 ReleaseEnvironmentService 按码点计数 ≤100 */
export const RELEASE_ENVIRONMENT_NAME_MAX_LENGTH = 100;
/** 排序上限：后端 Integer 口径（Java int 最大值） */
export const RELEASE_ENVIRONMENT_ORDER_MAX = 2147483647;
/** 停用原因上限：后端 ReleaseEnvironmentService.disable 按码点计数 ≤500 */
export const RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH = 500;

/** Unicode 码点计数（与后端 codePointCount 口径一致） */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** 字段级校验错误：调用方按 field 挂到对应输入下展示 */
export interface ReleaseEnvironmentFormFieldError {
  field: 'name' | 'category' | 'order' | 'approvalRequired';
  message: string;
}

/**
 * 校验表单输入，返回字段级错误列表（收集全部错误，不首错即停；空表示通过）。
 *
 * @param input 表单输入
 * @param status 编辑模式下的环境当前状态；新建模式传 null（此时 approvalRequired
 *   恒发送，PRODUCTION 类别下后端强制为 true）
 */
export function validateEnvironmentFormInput(
  input: ReleaseEnvironmentFormInput,
  status: ReleaseEnvironmentStatus | null,
): ReleaseEnvironmentFormFieldError[] {
  const errors: ReleaseEnvironmentFormFieldError[] = [];

  const name = input.name.trim();
  if (!name) {
    errors.push({ field: 'name', message: '环境名称不能为空' });
  } else if (codePointLength(name) > RELEASE_ENVIRONMENT_NAME_MAX_LENGTH) {
    errors.push({
      field: 'name',
      message: `环境名称不能超过 ${RELEASE_ENVIRONMENT_NAME_MAX_LENGTH} 个字符`,
    });
  }

  if (!(RELEASE_ENVIRONMENT_CATEGORIES as readonly string[]).includes(input.category)) {
    errors.push({ field: 'category', message: '请选择环境类别' });
  }

  const orderRaw = input.order.trim();
  if (!orderRaw) {
    errors.push({ field: 'order', message: '排序不能为空' });
  } else if (!/^\d+$/.test(orderRaw)) {
    errors.push({ field: 'order', message: '排序必须为非负整数' });
  } else if (Number(orderRaw) > RELEASE_ENVIRONMENT_ORDER_MAX) {
    errors.push({
      field: 'order',
      message: `排序不能超过 ${RELEASE_ENVIRONMENT_ORDER_MAX}`,
    });
  }

  // approvalRequired 为布尔开关：新建恒发送；编辑时 ACTIVE 必填、INACTIVE
  // 省略的规则由载荷构建函数保证，此处无需校验值本身。
  void status;

  return errors;
}

/** 类别是否为生产环境：后端 create/update 均把 approvalRequired 强制为 true */
export function categoryForcesApproval(category: string): boolean {
  return category === 'PRODUCTION';
}

/** 由表单输入构建 ReleaseEnvironmentCreatePayload。调用前应先跑校验。 */
export function buildEnvironmentCreatePayload(
  input: ReleaseEnvironmentFormInput,
  projectId: number,
): ReleaseEnvironmentCreatePayload {
  const category = (
    RELEASE_ENVIRONMENT_CATEGORIES as readonly string[]
  ).includes(input.category)
    ? (input.category as ReleaseEnvironmentCategory)
    : 'DEVELOPMENT';
  return {
    projectId,
    name: input.name.trim(),
    category,
    order: Number(input.order.trim()),
    // 生产环境后端强制审批通过：前端与老前端一致，直接送 true
    approvalRequired: categoryForcesApproval(category) ? true : input.approvalRequired,
  };
}

/**
 * 由表单输入构建 ReleaseEnvironmentUpdatePayload。
 *
 * 后端强制规则：ACTIVE 环境 approvalRequired 必填（送布尔值），INACTIVE
 * 环境必须省略（送了就抛错）。category 不可改，不出现在载荷中。
 */
export function buildEnvironmentUpdatePayload(
  environmentId: number,
  input: ReleaseEnvironmentFormInput,
  status: ReleaseEnvironmentStatus,
): ReleaseEnvironmentUpdatePayload {
  const payload: ReleaseEnvironmentUpdatePayload = {
    id: environmentId,
    name: input.name.trim(),
    order: Number(input.order.trim()),
  };
  if (status === 'ACTIVE') {
    payload.approvalRequired = categoryForcesApproval(input.category)
      ? true
      : input.approvalRequired;
  }
  return payload;
}

/**
 * 校验停用原因：strip 后非空且 ≤500 码点（后端 ReleaseEnvironmentService.disable
 * 口径；为空或超限直接抛 ReleaseEnvironmentInvalid）。
 * 返回 null 表示通过，否则返回字段错误文案。
 */
export function validateDisableReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) {
    return '停用原因不能为空（后端必填）。';
  }
  if (codePointLength(trimmed) > RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH) {
    return `停用原因不能超过 ${RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH} 个字符。`;
  }
  return null;
}
