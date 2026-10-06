import { isCanonicalUserId } from './api/auth';
import { ApiBusinessError } from './api/client';
import type { QueryClient } from '@tanstack/react-query';

/**
 * 个人中心（P5：p5-user-profile）的表单模型、校验、载荷与错误分类纯函数。
 *
 * 后端契约（已与 backend-ro 只读核对，禁止臆造）：
 * - 修改密码：POST /user/v1/changePassword ← ChangePasswordRequest
 *   { id: Long, oldPassword: String, newPassword: String } → Result<String>。
 *   注意该方法**没有**方法级 @PreAuthorize，继承 UserController 类级的
 *   @PreAuthorize("hasAuthority('system:admin')")——非管理员调它会被拦截器
 *   403，前端把个人中心放在 /sys/profile 并复用 sys 布局守卫与之对齐。
 * - 原密码错误不是异常：UserServiceImpl.changePassword 比对失败返回 false，
 *   controller 走 Result.fail((String) null, "原密码错误")
 *   → HTTP 200 + 信封 { code: 0 (CodeEnum.Fail), msg: "原密码错误" }。
 *   前端客户端解包后抛 ApiBusinessError{ code: 0, message: "原密码错误" }。
 *   code=0 是通用失败码，不能只按 code 判定字段归属，必须按 msg 匹配。
 * - 新密码不合规（空 / <8 位）：UserServiceImpl.requireUsablePassword 抛
 *   BusinessException(CodeEnum.ParamSetIllegal=10009, "密码不能为空" /
 *   "密码长度不能少于8位") → 信封 { code: 10009, msg }。前端先做 ≥8 位校验，
 *   这里只做纵深映射。
 * - 本人头像上传：POST /user/v1/profile/avatar，multipart @RequestParam("file")。
 *   UserAvatarService.validateDeclaredAvatar：空文件 / 大小超出 1B~2MiB /
 *   (mime,扩展名) 非 (image/jpeg,.jpg/.jpeg) 或 (image/png,.png) → 抛
 *   BusinessException(ParamSetIllegal=10009, "头像文件不能为空" /
 *   "头像大小必须在 1 字节到 2 MiB 之间" / "头像只允许 JPEG/PNG")。
 * - 头像读取：GET /user/v1/{userId}/avatar/content 返回原始字节流（非 Result
 *   信封）；无头像时 openContent 抛 BusinessException(NotFindError) → 非 2xx，
 *   前端按 HttpResponseError 降级为占位头像（systemApi.user.getAvatarContent）。
 */

/** 改密表单字段 */
export type ChangePasswordField = 'oldPassword' | 'newPassword' | 'confirmPassword';

/** 字段级校验错误（收集全部，不首错即停） */
export interface ChangePasswordFieldError {
  field: ChangePasswordField;
  message: string;
}

/** 改密表单输入（控件状态的中间表示；确认密码只存在于前端） */
export interface ChangePasswordFormInput {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function emptyChangePasswordInput(): ChangePasswordFormInput {
  return { oldPassword: '', newPassword: '', confirmPassword: '' };
}

/**
 * 改密表单校验：必填（3 个）+ 新密码 ≥8 位 + 两次输入一致（错误挂 confirmPassword）。
 * 收集全部错误，不首错即停。
 */
export function validateChangePasswordInput(input: ChangePasswordFormInput): ChangePasswordFieldError[] {
  const errors: ChangePasswordFieldError[] = [];
  if (!input.oldPassword) {
    errors.push({ field: 'oldPassword', message: '请输入原密码' });
  }
  if (!input.newPassword) {
    errors.push({ field: 'newPassword', message: '请输入新密码' });
  } else if (input.newPassword.length < 8) {
    errors.push({ field: 'newPassword', message: '新密码至少 8 位' });
  }
  if (!input.confirmPassword) {
    errors.push({ field: 'confirmPassword', message: '请再次输入新密码' });
  } else if (input.confirmPassword !== input.newPassword) {
    errors.push({ field: 'confirmPassword', message: '两次输入的新密码不一致' });
  }
  return errors;
}

/** 后端 ChangePasswordRequest 的精确字段名（多传 confirmPassword 会被忽略，但不传） */
export interface ChangePasswordPayload {
  id: number;
  oldPassword: string;
  newPassword: string;
}

export function buildChangePasswordPayload(userId: number, input: ChangePasswordFormInput): ChangePasswordPayload {
  return {
    id: userId,
    oldPassword: input.oldPassword,
    newPassword: input.newPassword,
  };
}

/** 后端业务码：参数非法（UserAvatarService / requireUsablePassword 共用） */
export const PARAM_SET_ILLEGAL_CODE = 10009;
/** 通用失败码（Result.fail 的 CodeEnum.Fail=0，原密码错误走这个码） */
export const GENERIC_FAIL_CODE = 0;
/** 原密码错误的后端 msg（Result.fail((String) null, "原密码错误")，逐字核对） */
export const WRONG_OLD_PASSWORD_MESSAGE = '原密码错误';

export type ChangePasswordErrorTarget = ChangePasswordField | 'submit';

export interface ClassifiedChangePasswordError {
  /** 错误归属字段；submit=挂在表单顶部，不归属任何字段 */
  field: ChangePasswordErrorTarget;
  message: string;
}

/**
 * 提交失败的错误分类（后端语义已实读，见文件头）：
 * - msg 含"原密码错误" → oldPassword 字段（code=0 是通用码，不单独作为判据）；
 * - code=10009 且 msg 含"密码" → newPassword 字段（requireUsablePassword 纵深）；
 * - 其余 → submit 级错误（取 err.message）。
 */
export function classifyChangePasswordError(err: unknown): ClassifiedChangePasswordError {
  if (err instanceof ApiBusinessError) {
    if (err.message.includes(WRONG_OLD_PASSWORD_MESSAGE)) {
      return { field: 'oldPassword', message: WRONG_OLD_PASSWORD_MESSAGE };
    }
    if (err.code === PARAM_SET_ILLEGAL_CODE && err.message.includes('密码')) {
      return { field: 'newPassword', message: err.message };
    }
    return { field: 'submit', message: err.message || '修改密码失败，请稍后重试' };
  }
  const message = err instanceof Error ? err.message : '修改密码失败，请稍后重试';
  return { field: 'submit', message };
}

/** 头像文件上限：2 MiB（UserAvatarService.MAX_AVATAR_BYTES，逐字核对） */
export const MAX_AVATAR_BYTES = 2_097_152;
/** 头像允许的 mime（后端 declared 校验要求 mime+扩展名配对，这里只做 mime 预检） */
const AVATAR_ALLOWED_MIMES = new Set(['image/jpeg', 'image/png']);

/**
 * 头像上传前的前端预检（与 UserAvatarService.validateDeclaredAvatar 对齐，
 * 后端仍是权威校验）。返回 null=通过，否则为展示给用户的错误文案。
 */
export function validateAvatarFile(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    return '头像大小必须在 1 字节到 2 MiB 之间';
  }
  if (!AVATAR_ALLOWED_MIMES.has(file.type.toLowerCase())) {
    return '头像只允许 JPEG/PNG';
  }
  return null;
}

/**
 * auth-store 的 userId 是规范十进制字符串；后端 changePassword.id / findById /
 * avatar/content 的 {userId} 都要 number。非法时返回 null（调用方禁用提交）。
 */
export function parseUserId(userId: string | null | undefined): number | null {
  if (!isCanonicalUserId(userId)) return null;
  return Number(userId);
}

/** 头像 blob 查询 key（上传成功后按此 key 失效，重新拉取即"上传后刷新可见"） */
export function avatarQueryKey(userId: number) {
  return ['hc', 'system', 'avatar', userId] as const;
}

/**
 * 头像上传成功后刷新（run207-codex-P5-r22-1 真问题回归）：
 * 首次头像 GET 仍在途时直接 invalidate，只会复用/标记旧请求——
 * 旧响应若晚于失效返回，会覆盖缓存导致继续显示旧头像。
 * 故先 cancelQueries 丢弃在途旧请求，再 invalidate 触发上传后的新 GET。
 */
export async function refreshAvatarAfterUpload(
  queryClient: QueryClient,
  userId: number,
): Promise<void> {
  const queryKey = avatarQueryKey(userId);
  await queryClient.cancelQueries({ queryKey });
  await queryClient.invalidateQueries({ queryKey });
}
