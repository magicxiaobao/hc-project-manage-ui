/**
 * p5-user-profile：改密表单校验/载荷/错误分类与头像预检的单元测试。
 *
 * 回归目标（契约见 src/lib/user-profile.ts 头部注释，后端语义已实读）：
 * - 三字段必填、收集全部错误不首错即停；
 * - 新密码 ≥8 位（与后端 requireUsablePassword 对齐）；
 * - 两次输入不一致的错误必须挂 confirmPassword 字段；
 * - 载荷精确为 { id, oldPassword, newPassword }，不泄漏 confirmPassword；
 * - 原密码错误（信封 code=0 + msg="原密码错误"）挂 oldPassword 字段；
 * - code=10009 密码类错误挂 newPassword 字段；
 * - 头像预检：JPEG/PNG + 1B~2MiB，与 UserAvatarService 对齐。
 */
import { describe, expect, it } from 'vitest';
import { ApiBusinessError } from '../api/client';
import {
  buildChangePasswordPayload,
  classifyChangePasswordError,
  emptyChangePasswordInput,
  MAX_AVATAR_BYTES,
  parseUserId,
  validateAvatarFile,
  validateChangePasswordInput,
  type ChangePasswordFormInput,
} from '../user-profile';

function input(patch: Partial<ChangePasswordFormInput> = {}): ChangePasswordFormInput {
  return { ...emptyChangePasswordInput(), ...patch };
}

describe('validateChangePasswordInput', () => {
  it('空表单三字段都报错', () => {
    const fields = validateChangePasswordInput(input()).map((e) => e.field);
    expect(fields).toEqual(['oldPassword', 'newPassword', 'confirmPassword']);
  });

  it('收集全部错误，不首错即停', () => {
    const errors = validateChangePasswordInput(
      input({ oldPassword: '', newPassword: 'short', confirmPassword: 'different' }),
    );
    const byField = Object.fromEntries(errors.map((e) => [e.field, e.message]));
    expect(byField.oldPassword).toBe('请输入原密码');
    expect(byField.newPassword).toBe('新密码至少 8 位');
    // 确认密码与新密码不一致 → 挂 confirmPassword
    expect(byField.confirmPassword).toBe('两次输入的新密码不一致');
    expect(errors).toHaveLength(3);
  });

  it('两次输入一致时不报确认密码错误', () => {
    const errors = validateChangePasswordInput(
      input({ oldPassword: 'old-12345', newPassword: 'new-12345', confirmPassword: 'new-12345' }),
    );
    expect(errors).toEqual([]);
  });

  it('新密码恰好 8 位通过', () => {
    const errors = validateChangePasswordInput(
      input({ oldPassword: 'old-12345', newPassword: '12345678', confirmPassword: '12345678' }),
    );
    expect(errors).toEqual([]);
  });

  it('确认密码为空时报必填而非不一致', () => {
    const errors = validateChangePasswordInput(
      input({ oldPassword: 'old-12345', newPassword: 'new-12345', confirmPassword: '' }),
    );
    expect(errors).toEqual([{ field: 'confirmPassword', message: '请再次输入新密码' }]);
  });
});

describe('buildChangePasswordPayload', () => {
  it('载荷精确为后端 DTO 字段，不泄漏确认密码', () => {
    const payload = buildChangePasswordPayload(
      42,
      input({ oldPassword: 'old-12345', newPassword: 'new-12345', confirmPassword: 'new-12345' }),
    );
    expect(payload).toEqual({ id: 42, oldPassword: 'old-12345', newPassword: 'new-12345' });
    expect(Object.keys(payload).sort()).toEqual(['id', 'newPassword', 'oldPassword']);
  });
});

describe('classifyChangePasswordError', () => {
  function businessError(code: number, msg: string) {
    return new ApiBusinessError({ code, msg, result: null }, 200);
  }

  it('原密码错误（code=0 + msg="原密码错误"）挂 oldPassword 字段', () => {
    // 后端：Result.fail((String) null, "原密码错误") → code=0(通用码)，必须按 msg 判定
    const classified = classifyChangePasswordError(businessError(0, '原密码错误'));
    expect(classified).toEqual({ field: 'oldPassword', message: '原密码错误' });
  });

  it('code=10009 的密码长度错误挂 newPassword 字段', () => {
    const classified = classifyChangePasswordError(businessError(10009, '密码长度不能少于8位'));
    expect(classified).toEqual({ field: 'newPassword', message: '密码长度不能少于8位' });
  });

  it('code=10009 的密码为空错误挂 newPassword 字段', () => {
    const classified = classifyChangePasswordError(businessError(10009, '密码不能为空'));
    expect(classified.field).toBe('newPassword');
  });

  it('其它业务错误挂 submit 级', () => {
    const classified = classifyChangePasswordError(businessError(10112, '请求失败'));
    expect(classified).toEqual({ field: 'submit', message: '请求失败' });
  });

  it('普通 Error 挂 submit 级并透传 message', () => {
    const classified = classifyChangePasswordError(new Error('network down'));
    expect(classified).toEqual({ field: 'submit', message: 'network down' });
  });

  it('未知类型错误挂 submit 级并给默认文案', () => {
    const classified = classifyChangePasswordError('boom');
    expect(classified.field).toBe('submit');
    expect(classified.message.length).toBeGreaterThan(0);
  });
});

describe('validateAvatarFile', () => {
  it('JPEG/PNG 在大小范围内通过', () => {
    expect(validateAvatarFile({ name: 'a.jpg', type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ name: 'a.png', type: 'image/png', size: MAX_AVATAR_BYTES })).toBeNull();
  });

  it('非图片类型拒绝', () => {
    expect(validateAvatarFile({ name: 'a.gif', type: 'image/gif', size: 1024 })).toBe('头像只允许 JPEG/PNG');
  });

  it('超 2 MiB 拒绝', () => {
    expect(
      validateAvatarFile({ name: 'a.png', type: 'image/png', size: MAX_AVATAR_BYTES + 1 }),
    ).toBe('头像大小必须在 1 字节到 2 MiB 之间');
  });

  it('空文件拒绝', () => {
    expect(validateAvatarFile({ name: 'a.png', type: 'image/png', size: 0 })).toBe(
      '头像大小必须在 1 字节到 2 MiB 之间',
    );
  });

  it('mime 大小写不敏感', () => {
    expect(validateAvatarFile({ name: 'a.JPG', type: 'IMAGE/JPEG', size: 100 })).toBeNull();
  });
});

describe('parseUserId', () => {
  it('规范十进制字符串转 number', () => {
    expect(parseUserId('42')).toBe(42);
  });

  it('非法输入返回 null', () => {
    expect(parseUserId(null)).toBeNull();
    expect(parseUserId(undefined)).toBeNull();
    expect(parseUserId('')).toBeNull();
    expect(parseUserId('abc')).toBeNull();
    expect(parseUserId('01x')).toBeNull();
  });
});
