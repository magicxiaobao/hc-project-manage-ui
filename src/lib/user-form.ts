import { parseRequiredPositiveInt } from './task-create';
import type { UserCreatePayload, UserResponse, UserUpdatePayload } from './api/system-types';

/**
 * 用户新建/编辑弹窗的表单模型、校验与载荷构建（P5：p5-user-form）。
 *
 * 纯函数，可独立测试。后端契约忠实于 backend-ro（只读研读）：
 * - POST /user/v1/createUser ← UserCreateRequest → Result<Long>（新建用户 id）
 * - POST /user/v1/updateUser ← UserUpdateRequest → Result<String>
 * - 用户名唯一性：后端无应用层检查，DB pm_user.username 有 UNIQUE 约束；
 *   重复创建会触发 MySQL 1062 → DuplicateKeyException → GlobalExceptionHandler
 *   的 RuntimeException 兜底 → HTTP 500 + Result{code:10112, msg:"请求失败"}
 *   （AuthErrorEnum.RequestFail），与其它服务端错误不可区分。故唯一性必须用
 *   GET /user/v1/list?keyword= 做提交前预检，再对返回做精确匹配（该端点是
 *   username LIKE OR cnName LIKE，且只返回 validStatus=VALID 的用户）。
 * - 密码：后端 UserServiceImpl.requireUsablePassword 要求非空且 ≥8 位
 *   （CodeEnum.ParamSetIllegal "密码长度不能少于8位"）；编辑时 updater 为 null
 *   则不修改（BaseUserUpdater.updateUser 只应用非空字段）——注意空字符串会被
 *   判为"密码不能为空"而抛错，故编辑留空时载荷必须省略 password（不能传 ""）。
 * - createUser 不传 status/enabled/admin/roles/memo（checklist 约定；后端
 *   UserCreator.init() 会自行初始化有效状态）。
 * - 编辑时清空可选字段不会真正清空：后端 updater 忽略 null 字段，属后端契约
 *   限制，前端如实透传即可。
 * - username 3–20 字符是 checklist 约定（后端 DTO 无长度校验，DB 列为
 *   VARCHAR(50)）；email/phone 格式校验为前端约定（后端无校验）。
 * - 部门/岗位：后端只有 UserDTO 上的透传字段，无 CRUD 端点，表单只做直输
 *   （checklist exclusions 已明确）。
 */

/** 用户表单输入（控件状态的中间表示） */
export interface UserFormInput {
  username: string;
  /** 新建必填；编辑留空表示不修改 */
  password: string;
  cnName: string;
  email: string;
  phone: string;
  /** 部门 ID：直输正整数文本，空=不填 */
  departmentIdText: string;
  /** 岗位 ID：直输正整数文本，空=不填 */
  positionIdText: string;
  departmentName: string;
}

/** 新建模式的空表单 */
export function emptyUserFormInput(): UserFormInput {
  return {
    username: '',
    password: '',
    cnName: '',
    email: '',
    phone: '',
    departmentIdText: '',
    positionIdText: '',
    departmentName: '',
  };
}

/** 编辑模式：从 UserResponse 生成初始表单（password 恒为空=不修改） */
export function userFormInputFromResponse(user: UserResponse): UserFormInput {
  return {
    username: user.username ?? '',
    password: '',
    cnName: user.cnName ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    departmentIdText: user.departmentId != null ? String(user.departmentId) : '',
    positionIdText: user.positionId != null ? String(user.positionId) : '',
    departmentName: user.departmentName ?? '',
  };
}

/** 字段级校验错误 */
export interface UserFormFieldError {
  field: keyof UserFormInput;
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 手机号：宽松校验（数字/空格/短横/加号/括号，6–20 位），后端无校验 */
const PHONE_PATTERN = /^[+\d][\d\s\-()]{5,19}$/;

/**
 * 校验表单输入（新建/编辑共用；isCreate 决定 password 是否必填）。
 * 返回全部 {field, message}，不首错即停。唯一性不在此处做（需异步预检）。
 */
export function validateUserFormInput(input: UserFormInput, isCreate: boolean): UserFormFieldError[] {
  const errors: UserFormFieldError[] = [];

  const username = input.username.trim();
  if (!username) {
    errors.push({ field: 'username', message: '用户名不能为空' });
  } else if (username.length < 3 || username.length > 20) {
    errors.push({ field: 'username', message: '用户名长度为 3–20 个字符' });
  }

  if (isCreate) {
    // 纯空格视为未填写：后端 isBlank 会拒绝，直达后端只会落到通用错误；
    // 提前在前端拦下并挂到密码字段。
    if (!input.password.trim()) {
      errors.push({ field: 'password', message: '新建用户必须设置密码' });
    } else if (input.password.length < 8) {
      errors.push({ field: 'password', message: '密码长度不能少于 8 位' });
    }
  } else if (input.password && !input.password.trim()) {
    // 编辑留空=不修改；填了纯空格则后端 isBlank 拒绝，提前挂字段错误
    errors.push({ field: 'password', message: '密码不能全为空格' });
  } else if (input.password && input.password.length < 8) {
    // 编辑留空=不修改；填写了则与新建同规则（后端 requireUsablePassword）
    errors.push({ field: 'password', message: '密码长度不能少于 8 位' });
  }

  const email = input.email.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.push({ field: 'email', message: '邮箱格式不正确' });
  }

  const phone = input.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.push({ field: 'phone', message: '手机号格式不正确' });
  }

  if (input.departmentIdText.trim() && parseRequiredPositiveInt(input.departmentIdText) === null) {
    errors.push({ field: 'departmentIdText', message: '部门 ID 须为正整数' });
  }
  if (input.positionIdText.trim() && parseRequiredPositiveInt(input.positionIdText) === null) {
    errors.push({ field: 'positionIdText', message: '岗位 ID 须为正整数' });
  }

  return errors;
}

function emptyToNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

/** 构建新建载荷：只传 checklist 约定的字段，不传 status/enabled/admin/roles/memo */
export function buildUserCreatePayload(input: UserFormInput): UserCreatePayload {
  return {
    username: input.username.trim(),
    password: input.password,
    cnName: emptyToNull(input.cnName),
    email: emptyToNull(input.email),
    phone: emptyToNull(input.phone),
    departmentId: input.departmentIdText.trim()
      ? parseRequiredPositiveInt(input.departmentIdText)
      : null,
    positionId: input.positionIdText.trim()
      ? parseRequiredPositiveInt(input.positionIdText)
      : null,
    departmentName: emptyToNull(input.departmentName),
  };
}

/**
 * 构建更新载荷：password 留空时省略（undefined → JSON 丢弃，后端按 null 处理，
 * updater 忽略 null 字段 = 不修改；绝不能传 ""，否则后端判"密码不能为空"）。
 */
export function buildUserUpdatePayload(id: number, input: UserFormInput): UserUpdatePayload {
  return {
    id,
    username: input.username.trim(),
    password: input.password ? input.password : undefined,
    cnName: emptyToNull(input.cnName),
    email: emptyToNull(input.email),
    phone: emptyToNull(input.phone),
    departmentId: input.departmentIdText.trim()
      ? parseRequiredPositiveInt(input.departmentIdText)
      : null,
    positionId: input.positionIdText.trim()
      ? parseRequiredPositiveInt(input.positionIdText)
      : null,
    departmentName: emptyToNull(input.departmentName),
  };
}

/**
 * 提交会话守卫：隔离"预检/提交在途"期间的旧流程回调。
 *
 * 回归 run168-codex-P5-r9-1 / pi P2-1：handleSubmit 在 await 预检（GET list）
 * 期间 isPending 仍为 false，用户可取消重开并再次提交；旧预检返回后仍会
 * mutateAsync 旧快照并 doClose，污染新会话（旧用户名被创建、新草稿被清空、
 * 旧错误挂到新表单）。用法：提交开始时 begin() 取令牌；每次 await 返回后
 * isCurrent(token) 校验，失效则静默丢弃；doClose()/新提交开始时使旧令牌失效。
 */
export class SubmitSessionGuard {
  private epoch = 0;
  /** 开始一次提交流程，返回其会话令牌 */
  begin(): number {
    this.epoch += 1;
    return this.epoch;
  }
  /** 使当前所有未完成的会话令牌失效（弹窗关闭/新提交开始时调用） */
  invalidate(): void {
    this.epoch += 1;
  }
  /** 令牌是否仍是当前会话（await 返回后校验用） */
  isCurrent(token: number): boolean {
    return token === this.epoch;
  }
}

/** 详情数据到达后的回填决策（回归 run168-codex-P5-r9-2） */
export type UserDetailRefillDecision =
  /** 该用户首次拿到详情：初始化表单 */
  | 'initialize'
  /** 后台重取到新版本且表单未被改动：回填最新并提示复核 */
  | 'refill'
  /** 后台重取到新版本但用户已改动表单：不覆盖，提示复核 */
  | 'warn-keep'
  | 'noop';

/**
 * 决定详情数据到达后是否回填表单。
 * - 首次拿到某用户详情 → initialize；
 * - 同一用户数据版本变化（dataUpdatedAt 推进，如后台 refetch）→ 表单干净则
 *   refill（旧实现只认首次快照，永久忽略后续重取，导致旧值覆盖新值），
 *   表单已被改动则 warn-keep（不静默覆盖用户输入）。
 */
export function decideUserDetailRefill(args: {
  initialized: boolean;
  versionChanged: boolean;
  formMatchesInitial: boolean;
}): UserDetailRefillDecision {
  if (!args.initialized) return 'initialize';
  if (!args.versionChanged) return 'noop';
  return args.formMatchesInitial ? 'refill' : 'warn-keep';
}

/**
 * 预检 await 返回、发 mutation 请求前的提交放行决策。
 */
export type SubmitProceedDecision =
  /** 可以继续提交 */
  | 'proceed'
  /** 会话令牌过期（弹窗关闭重开等；r9 既有语义：静默丢弃） */
  | 'abort-session-stale'
  /** 预检在途期间详情被后台重取更新：中止旧快照提交，要求用户复核后重提 */
  | 'abort-detail-version-changed';

/**
 * 决定预检返回后是否继续提交（回归 run171-codex-P5-r10-1）。
 *
 * 背景：编辑弹窗的详情回填 effect 在后台重取成功时推进 loadedVersionRef；
 * handleSubmit 只验会话令牌（r9 机制）时，预检在途期间会话令牌仍有效——
 * "提交在途→详情回填→预检返回" 的时序下，旧快照会继续提交并用旧数据覆盖
 * 新数据，且 busy 锁死用户复核。
 * 用法：提交开始时记录 submittedVersion=表单基线版本（initialVersionRef，
 * 回归 run177-codex-pi-P5-r12-1：不能读缓存版本，否则"缓存已推进但回填未
 * 落实"的窗口里两侧都读新版本，会直接提交旧载荷）；预检 await 返回后同步
 * 读缓存版本做 currentVersion 比较；版本推进则返回 'abort-detail-version-changed'，
 * 调用方中止本次提交（busy 已释放、不关闭弹窗、不丢弃新值）并提示用户复核
 * 后重新提交。
 */
export function decideSubmitProceed(args: {
  /** 会话是否已过期（r9 会话守卫 isCurrent 取反） */
  sessionStale: boolean;
  /** 提交开始时记录的表单基线版本（initialVersionRef；新建模式恒为 null） */
  submittedVersion: number | null;
  /** 预检 await 返回时当前的详情数据版本 */
  currentVersion: number | null;
}): SubmitProceedDecision {
  if (args.sessionStale) return 'abort-session-stale';
  return args.currentVersion !== args.submittedVersion
    ? 'abort-detail-version-changed'
    : 'proceed';
}

/**
 * 版本冲突中止后把服务端最新详情变基到表单（回归 run175-pi-P5-r11-2）。
 *
 * 背景：decideSubmitProceed 判 abort-detail-version-changed 时，若只提示
 * "请复核"而不回填新值——warn-keep 路径下表单仍是脏的 v1 基线——用户第二次
 * 保存时版本已一致，会直接提交基于 v1 的整表单（含未改动字段的旧值）覆盖
 * 服务端 v2，中止只拖慢一次，复核无从谈起。
 * 规则：逐字段比较 current vs baseline；用户改过的字段保留用户值，未改动的
 * 字段取 server（v2）值。调用方把返回结果装入表单，并把 dirty 基线重置为
 * server 快照：用户改动仍显示为脏（守卫继续布防），重提即基于 v2 提交。
 * - baseline 为 null（无基线，防御性分支）→ 以 server 为比较基线：与 server
 *   不同的字段视为用户改动保留，避免丢弃用户输入。
 * - password：编辑模式 response 恒转为空；用户未改则双方皆空→取空（不改密码），
 *   用户改过则保留用户输入。
 */
export function rebaseUserFormOnVersionConflict(args: {
  /** 提交会话开始时的表单基线（initialRef 快照；null=无基线） */
  baseline: UserFormInput | null;
  /** 当前表单（含用户改动） */
  current: UserFormInput;
  /** 服务端最新详情转换来的表单（v2 基线） */
  server: UserFormInput;
}): UserFormInput {
  const base = args.baseline ?? args.server;
  const next: UserFormInput = { ...args.server };
  for (const key of Object.keys(args.server) as (keyof UserFormInput)[]) {
    if (args.current[key] !== base[key]) {
      // 该字段被用户改过：保留用户值
      next[key] = args.current[key];
    }
  }
  return next;
}

/**
 * 用户名唯一性预检：在 GET /user/v1/list?keyword= 结果中做精确匹配。
 * - 该端点是 username LIKE OR cnName LIKE，故必须客户端精确过滤；
 * - 编辑模式排除自身 id；
 * - 注意该端点只返回 validStatus=VALID 的用户：已停用账号占用的用户名预检
 *   查不到，提交时会触发 DB 唯一约束 → 10112，调用方把 10112 也挂到用户名
 *   字段下（见 user-form-dialog）。
 */
export function isUsernameTaken(
  users: Pick<UserResponse, 'id' | 'username'>[],
  username: string,
  selfId: number | null,
): boolean {
  return users.some((user) => user.username === username && user.id !== selfId);
}
