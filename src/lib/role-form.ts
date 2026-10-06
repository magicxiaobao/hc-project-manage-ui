import type { RoleCreatePayload, RoleResponse, RoleUpdatePayload } from './api/system-types';
import { ApiBusinessError } from './api/client';
import { toUserMessage } from './query/error';

/**
 * 角色新建/编辑弹窗的表单模型、校验与载荷构建（P5：p5-role-list）。
 *
 * 纯函数，可独立测试。后端契约忠实于 system.ts 的 role 域方法（p5-api 时研读
 * 后端 DTO 建模，见 system-types.ts RoleCreatePayload/RoleUpdatePayload/
 * RoleResponse 注释；本轮未改后端）：
 * - POST /role/v1/createRole ← RoleCreateRequest → Result<Long>（新建角色 id）
 * - POST /role/v1/updateRole ← RoleUpdateRequest → Result<String>
 * - POST /role/v1/valid/{id} / invalid/{id} 启用/禁用
 * - GET /role/v1/findById/{id} 编辑回填
 * - 角色编码唯一性：后端无应用层检查（同用户名的 DB 唯一约束模式），提交前用
 *   GET /role/v1/list?keyword= 预检。注意该端点的 LIKE-OR 缺括号 bug
 *   （backend-memo-p5.md §5）：SQL 展开为
 *   `role_name LIKE ? OR (role_code LIKE ? AND enabled = 1)`，名称命中的禁用
 *   角色会漏进结果——故预检不能只看"返回非空"，必须按 roleCode 做精确匹配
 *   （isRoleCodeTaken），编辑模式额外排除自身 id。
 * - roleName/roleCode 只做"必填"校验：后端 DTO 的长度/格式约束未实读确认，
 *   不发明前端没有的规则（格式提示见下方注释）。
 */

/** 角色表单输入（控件状态的中间表示） */
export interface RoleFormInput {
  roleName: string;
  roleCode: string;
  description: string;
  /** 启用开关：新建默认启用 */
  enabled: boolean;
}

/** 新建模式的空表单 */
export function emptyRoleFormInput(): RoleFormInput {
  return {
    roleName: '',
    roleCode: '',
    description: '',
    enabled: true,
  };
}

/** 编辑模式：从 RoleResponse 生成初始表单 */
export function roleFormInputFromResponse(role: RoleResponse): RoleFormInput {
  return {
    roleName: role.roleName ?? '',
    roleCode: role.roleCode ?? '',
    description: role.description ?? '',
    // RoleResponse.enabled 为 boolean|null：null（未映射）时回退为 true，
    // 避免把未知状态静默写成禁用；列表页同样按此口径展示。
    enabled: role.enabled ?? true,
  };
}

/** 字段级校验错误 */
export interface RoleFormFieldError {
  field: keyof RoleFormInput;
  message: string;
}

/**
 * 校验表单输入（新建/编辑共用）。
 * 返回全部 {field, message}，不首错即停。唯一性不在此处做（需异步预检）。
 * roleCode 格式：后端未实读到格式约束，只要求必填；建议用大写字母/数字/
 * 下划线（如 ADMIN、PROJECT_MANAGER），但不做硬拦截——硬拦一条后端没有的
 * 规则会把合法输入挡在门外。
 */
export function validateRoleFormInput(input: RoleFormInput): RoleFormFieldError[] {
  const errors: RoleFormFieldError[] = [];

  if (!input.roleName.trim()) {
    errors.push({ field: 'roleName', message: '角色名称不能为空' });
  }
  if (!input.roleCode.trim()) {
    errors.push({ field: 'roleCode', message: '角色编码不能为空' });
  }

  return errors;
}

function emptyToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

/** 构建新建载荷 */
export function buildRoleCreatePayload(input: RoleFormInput): RoleCreatePayload {
  return {
    roleName: input.roleName.trim(),
    roleCode: input.roleCode.trim(),
    description: emptyToNull(input.description),
    enabled: input.enabled,
  };
}

/** 构建更新载荷：id 必带；description 空字符串=显式清空（见下注释） */
export function buildRoleUpdatePayload(id: number, input: RoleFormInput): RoleUpdatePayload {
  return {
    id,
    roleName: input.roleName.trim(),
    roleCode: input.roleCode.trim(),
    // 后端 BaseRoleUpdater.updateRole 用 Optional.ofNullable 更新：null=跳过
    // 该字段（不更新），''=显式写空。故"清空已有描述"必须发 ''，发 null 会
    // 导致"删掉描述保存后重开旧描述仍在"（2026-10-05 实读后端确认）。
    // 新建载荷保持 null（新行语义与 '' 等价，无此陷阱）。
    description: input.description.trim() ? input.description.trim() : '',
    enabled: input.enabled,
  };
}

/**
 * 角色编码唯一性预检：在 GET /role/v1/list?keyword= 结果中做精确匹配。
 * - 该端点是 roleName LIKE OR roleCode LIKE（且有缺括号 bug，见文件头），
 *   故必须客户端按 roleCode 精确过滤，不能只看返回非空；
 * - 比较不区分大小写：DB 唯一索引列 collation 为 utf8mb4_unicode_ci
 *   （V1__create_frozen_tables.sql:775），已有启用 ADMIN 时新建 admin 预检
 *   必须判冲突，否则预检放行、POST 被 DB 拒绝；
 * - 服务端唯一约束为最终裁决，预检只做快速反馈；
 * - 编辑模式排除自身 id；
 * - 注意该端点主要返回 enabled=true 的角色（bug 导致名称命中的禁用角色也
 *   可能混入）：已禁用角色占用的编码预检可能查不到，提交时若后端报冲突，
 *   调用方把服务端错误挂到 roleCode 字段下（见 role-form-dialog）。
 */
export function isRoleCodeTaken(
  roles: Pick<RoleResponse, 'id' | 'roleCode'>[],
  roleCode: string,
  selfId: number | null,
): boolean {
  const target = roleCode.trim().toLowerCase();
  return roles.some(
    (role) => (role.roleCode ?? '').trim().toLowerCase() === target && role.id !== selfId,
  );
}

/**
 * 版本冲突中止后把服务端最新详情变基到表单（语义同 user-form.ts 的
 * rebaseUserFormOnVersionConflict，角色表单只有 4 个字段，独立实现）。
 *
 * 规则：逐字段比较 current vs baseline；用户改过的字段保留用户值，未改动的
 * 字段取 server（v2）值。调用方把返回结果装入表单，并把 dirty 基线重置为
 * server 快照：用户改动仍显示为脏（守卫继续布防），重提即基于 v2 提交。
 */
export function rebaseRoleFormOnVersionConflict(args: {
  /** 提交会话开始时的表单基线（initialRef 快照；null=无基线） */
  baseline: RoleFormInput | null;
  /** 当前表单（含用户改动） */
  current: RoleFormInput;
  /** 服务端最新详情转换来的表单（v2 基线） */
  server: RoleFormInput;
}): RoleFormInput {
  const base = args.baseline ?? args.server;
  // 逐字段显式变基：RoleFormInput 含 string 与 boolean 两类字段，泛型
  // keyof 循环赋值会被 TS 收窄为 never（user-form 版全字段 string 才无此问题）。
  return {
    roleName:
      args.current.roleName !== base.roleName ? args.current.roleName : args.server.roleName,
    roleCode:
      args.current.roleCode !== base.roleCode ? args.current.roleCode : args.server.roleCode,
    description:
      args.current.description !== base.description
        ? args.current.description
        : args.server.description,
    enabled:
      args.current.enabled !== base.enabled ? args.current.enabled : args.server.enabled,
  };
}

/**
 * 角色提交失败的后端契约（实读确认，backend-ro 只读研读 2026-10-05）：
 *
 * - RoleServiceImpl.createRole/updateRole 走 EntityCreator/EntityUpdater
 *   （EntityOperations.doCreate/doUpdate），且未注入自定义 errorHook；
 *   默认 errorHook 把 insert/update 失败包装为
 *   BusinessException(CodeEnum.SaveError=10002 / UpdateError=10003)，HTTP 400。
 * - 10002/10003 只是"保存/更新失败"的大类码：后端未解析唯一约束字段，无法断言
 *   一定是 role_code 冲突（也可能是其它字段冲突或 DB 异常），故挂字段的措辞
 *   必须谨慎（"可能"类），不可断言"该角色编码已存在"。
 * - 10112 = AuthErrorEnum.RequestFail，只是 GlobalExceptionHandler 对
 *   RuntimeException 的兜底码（@ResponseStatus 500，如 DB 连接故障），绝不
 *   代表编码冲突。把它标为"编码已存在"会误导用户改合法编码，且会清掉整体
 *   失败说明使真实失败不可见——一律归入中性失败分支。
 */
export const ROLE_SAVE_ERROR_CODE = 10002;
export const ROLE_UPDATE_ERROR_CODE = 10003;

/** 提交失败的错误落点决策（纯函数，便于单元测试）。 */
export interface RoleSubmitFailureDecision {
  /** 挂到 roleCode 字段下的错误文案 */
  roleCodeError: string;
  /**
   * 是否清除整体 submitError：仅可识别为"可能的编码冲突"时清除，避免双重错误；
   * 未知失败必须为 false（保留整体失败说明，真实失败不可隐藏）。
   */
  clearOverall: boolean;
  /** 整体 submitError 文案：null 表示不设置（保持调用方现状） */
  overallError: string | null;
}

export function decideRoleSubmitFailure(
  error: unknown,
  isCreate: boolean,
): RoleSubmitFailureDecision {
  const detail = toUserMessage(error);
  if (
    error instanceof ApiBusinessError &&
    (error.code === ROLE_SAVE_ERROR_CODE || error.code === ROLE_UPDATE_ERROR_CODE)
  ) {
    // 可识别为"可能的编码冲突"：写入 roleCode 字段，用户编辑 roleCode 时
    // 调用方自动清除（编辑即清）；整体说明可清除，避免双重错误。
    return {
      roleCodeError: `该角色编码可能已被占用（也可能是其它字段冲突）：${detail}`,
      clearOverall: true,
      overallError: null,
    };
  }
  // 10112 及所有未知码：中性失败分支。绝不标为"编码已存在"；
  // 整体失败说明必须保留（clearOverall=false），真实失败不可隐藏。
  return {
    roleCodeError: '提交失败，请检查表单后重试',
    clearOverall: false,
    overallError: `${isCreate ? '创建' : '更新'}失败：${detail}`,
  };
}
