/**
 * p5-user-form：用户表单校验与载荷构建的单元测试。
 *
 * 回归目标（契约见 src/lib/user-form.ts 头部注释）：
 * - username 必填且 3–20 字符（checklist 约定；后端 DTO 无长度校验）；
 * - password 新建必填 ≥8 位，编辑留空=不修改（载荷省略，绝不传 ""）；
 * - 字段级校验收集全部错误，不首错即停；
 * - 部门/岗位 ID 直输：非法输入判错，空=不填；
 * - 新建载荷不含 status/enabled/admin/roles/memo；
 * - 唯一性预检：list?keyword= 是 LIKE 匹配，需精确过滤，编辑排除自身。
 */
import { describe, expect, it } from 'vitest';
import {
  buildUserCreatePayload,
  buildUserUpdatePayload,
  decideUserDetailRefill,
  emptyUserFormInput,
  isUsernameTaken,
  SubmitSessionGuard,
  userFormInputFromResponse,
  validateUserFormInput,
  type UserFormInput,
} from '../user-form';

function input(patch: Partial<UserFormInput> = {}): UserFormInput {
  return { ...emptyUserFormInput(), ...patch };
}

describe('validateUserFormInput', () => {
  it('空表单在新建模式下只报 username/password 必填', () => {
    const fields = validateUserFormInput(input(), true).map((e) => e.field);
    expect(fields).toContain('username');
    expect(fields).toContain('password');
    expect(fields).not.toContain('email');
  });

  it('收集全部错误，不首错即停', () => {
    const errors = validateUserFormInput(
      input({ username: 'ab', password: 'short', email: 'not-an-email', departmentIdText: 'x' }),
      true,
    );
    const fields = errors.map((e) => e.field).sort();
    expect(fields).toEqual(['departmentIdText', 'email', 'password', 'username']);
  });

  it('username 边界：2 个字符太短，3–20 通过，21 个太长', () => {
    expect(
      validateUserFormInput(input({ username: 'ab', password: '12345678' }), true).map((e) => e.field),
    ).toContain('username');
    expect(
      validateUserFormInput(input({ username: 'abc', password: '12345678' }), true),
    ).toEqual([]);
    expect(
      validateUserFormInput(input({ username: 'a'.repeat(20), password: '12345678' }), true),
    ).toEqual([]);
    expect(
      validateUserFormInput(input({ username: 'a'.repeat(21), password: '12345678' }), true).map(
        (e) => e.field,
      ),
    ).toContain('username');
  });

  it('username 按 trim 后长度判定', () => {
    const errors = validateUserFormInput(
      input({ username: '  ab  ', password: '12345678' }),
      true,
    );
    expect(errors.map((e) => e.field)).toContain('username');
  });

  it('新建密码 ≥8 位，编辑留空不报错、填了则同样 ≥8 位', () => {
    expect(
      validateUserFormInput(input({ username: 'alice', password: '1234567' }), true).map(
        (e) => e.field,
      ),
    ).toContain('password');
    // 编辑：留空=不修改，不报错
    expect(validateUserFormInput(input({ username: 'alice', password: '' }), false)).toEqual([]);
    // 编辑：填了 <8 位则报错
    expect(
      validateUserFormInput(input({ username: 'alice', password: '1234567' }), false).map(
        (e) => e.field,
      ),
    ).toContain('password');
  });

  it('邮箱/手机格式校验仅在有值时触发', () => {
    expect(
      validateUserFormInput(input({ username: 'alice', password: '12345678', email: 'a@b' }), true).map(
        (e) => e.field,
      ),
    ).toContain('email');
    expect(
      validateUserFormInput(
        input({ username: 'alice', password: '12345678', email: 'a@b.com', phone: 'abc' }),
        true,
      ).map((e) => e.field),
    ).toContain('phone');
    expect(
      validateUserFormInput(
        input({ username: 'alice', password: '12345678', email: 'a@b.com', phone: '13800138000' }),
        true,
      ),
    ).toEqual([]);
  });

  it('部门/岗位 ID：空=不填；非正整数报错', () => {
    expect(
      validateUserFormInput(
        input({ username: 'alice', password: '12345678', departmentIdText: '0' }),
        true,
      ).map((e) => e.field),
    ).toContain('departmentIdText');
    expect(
      validateUserFormInput(
        input({ username: 'alice', password: '12345678', positionIdText: '12a' }),
        true,
      ).map((e) => e.field),
    ).toContain('positionIdText');
    expect(
      validateUserFormInput(
        input({ username: 'alice', password: '12345678', departmentIdText: '7', positionIdText: '9' }),
        true,
      ),
    ).toEqual([]);
  });
});

describe('buildUserCreatePayload', () => {
  it('只传 checklist 约定字段，不传 status/enabled/admin/roles/memo', () => {
    const payload = buildUserCreatePayload(
      input({
        username: '  bob  ',
        password: '12345678',
        cnName: '鲍勃',
        email: 'bob@example.com',
        phone: '13800138000',
        departmentIdText: '3',
        positionIdText: '',
        departmentName: '研发部',
      }),
    );
    expect(payload).toEqual({
      username: 'bob',
      password: '12345678',
      cnName: '鲍勃',
      email: 'bob@example.com',
      phone: '13800138000',
      departmentId: 3,
      positionId: null,
      departmentName: '研发部',
    });
    expect('enabled' in payload).toBe(false);
    expect('admin' in payload).toBe(false);
    expect('status' in payload).toBe(false);
    expect('roles' in payload).toBe(false);
    expect('memo' in payload).toBe(false);
  });
});

describe('buildUserUpdatePayload', () => {
  it('password 留空时省略（undefined），后端 updater 忽略=null 字段=不修改', () => {
    const payload = buildUserUpdatePayload(42, input({ username: 'bob', password: '' }));
    expect(payload.id).toBe(42);
    expect(payload.password).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('password');
  });

  it('password 填写时透传', () => {
    const payload = buildUserUpdatePayload(42, input({ username: 'bob', password: 'newpass99' }));
    expect(payload.password).toBe('newpass99');
  });

  const original = {
    cnName: '鲍勃',
    email: 'bob@example.com',
    phone: '13800138000',
    departmentName: '研发部',
  };

  it.each(['cnName', 'email', 'phone', 'departmentName'] as const)(
    '原始 %s 有值，显式清空传空字符串，其余字段保持原值',
    (field) => {
      for (const cleared of ['', '   ']) {
        const payload = buildUserUpdatePayload(
          42,
          input({ username: 'bob', ...original, [field]: cleared }),
          original,
        );
        expect(payload).toMatchObject({ ...original, [field]: '' });
        expect(payload.password).toBeUndefined();
        expect(payload.departmentId).toBeNull();
        expect(payload.positionId).toBeNull();
      }
    },
  );

  it.each([null, '', '   '])('原始文本字段为空（%j），输入清空仍传 null', (empty) => {
    const payload = buildUserUpdatePayload(
      42,
      input({ username: 'bob', cnName: '', email: '   ', phone: '', departmentName: '   ' }),
      { cnName: empty, email: empty, phone: empty, departmentName: empty },
    );
    expect(payload).toMatchObject({ cnName: null, email: null, phone: null, departmentName: null });
  });

  it('输入未改，与 original 相同时传原值', () => {
    const payload = buildUserUpdatePayload(42, input({ username: 'bob', ...original }), original);
    expect(payload).toMatchObject(original);
  });

  it('caller 传 null original 时沿用原有 trim/空转 null 语义', () => {
    const snapshot = input({
      username: '  bob  ',
      cnName: '  鲍勃  ',
      email: '   ',
      phone: ' 13800138000 ',
      departmentName: '',
      departmentIdText: ' 3 ',
      positionIdText: '',
    });
    const payload = buildUserUpdatePayload(42, snapshot, null);
    expect(payload).toEqual({
      id: 42,
      username: 'bob',
      password: undefined,
      cnName: '鲍勃',
      email: null,
      phone: '13800138000',
      departmentId: 3,
      positionId: null,
      departmentName: null,
    });
    expect(payload).toEqual(buildUserUpdatePayload(42, snapshot));
    expect(payload).toEqual(buildUserUpdatePayload(42, snapshot, undefined));
  });
});

describe('isUsernameTaken', () => {
  const candidates = [
    { id: 1, username: 'alice' },
    { id: 2, username: 'alice2' },
    { id: 3, username: null },
  ];

  it('精确匹配：LIKE 误伤（alice2）不算占用', () => {
    // 若只做子串匹配会把 alice2 误判为占用
    expect(isUsernameTaken(candidates, 'alice', null)).toBe(true);
    expect(isUsernameTaken([{ id: 2, username: 'alice2' }], 'alice', null)).toBe(false);
  });

  it('编辑模式排除自身 id', () => {
    expect(isUsernameTaken(candidates, 'alice', 1)).toBe(false);
    expect(isUsernameTaken(candidates, 'alice', 99)).toBe(true);
  });

  it('空列表永不占用', () => {
    expect(isUsernameTaken([], 'alice', null)).toBe(false);
  });
});

describe('userFormInputFromResponse', () => {
  it('回填详情，password 恒为空（=不修改）', () => {
    const form = userFormInputFromResponse({
      id: 7,
      username: 'carol',
      cnName: '卡罗尔',
      email: 'carol@example.com',
      phone: null,
      departmentId: 5,
      positionId: null,
      departmentName: '测试部',
      positionName: null,
      admin: false,
      enabled: true,
      lastLoginTime: null,
      createdAt: null,
      updatedAt: null,
    });
    expect(form.username).toBe('carol');
    expect(form.password).toBe('');
    expect(form.departmentIdText).toBe('5');
    expect(form.positionIdText).toBe('');
    expect(form.departmentName).toBe('测试部');
  });
});

describe('validateUserFormInput 密码空白', () => {
  it('新建：纯空格密码视为未填写，报错挂密码字段（回归 r9-4）', () => {
    const errors = validateUserFormInput(
      input({ username: 'alice', password: '        ' }),
      true,
    );
    expect(errors.map((e) => e.field)).toContain('password');
    expect(errors.find((e) => e.field === 'password')?.message).toBe(
      '新建用户必须设置密码',
    );
  });

  it('新建：前后带空格但实质 ≥8 位仍按原规则判定长度', () => {
    const errors = validateUserFormInput(
      input({ username: 'alice', password: '  12345678  ' }),
      true,
    );
    expect(errors.map((e) => e.field)).not.toContain('password');
  });

  it('编辑：填写纯空格密码挂字段错误而非直达后端（回归 r9-4）', () => {
    const errors = validateUserFormInput(
      input({ username: 'alice', password: '   ' }),
      false,
    );
    expect(errors.map((e) => e.field)).toContain('password');
    expect(errors.find((e) => e.field === 'password')?.message).toBe(
      '密码不能全为空格',
    );
  });

  it('编辑：留空仍=不修改，不报错', () => {
    expect(validateUserFormInput(input({ username: 'alice', password: '' }), false)).toEqual(
      [],
    );
  });
});

describe('SubmitSessionGuard（回归 r9-1：预检会话取消丢弃旧结果）', () => {
  it('begin 的令牌当前有效', () => {
    const guard = new SubmitSessionGuard();
    const token = guard.begin();
    expect(guard.isCurrent(token)).toBe(true);
  });

  it('新提交开始后，旧令牌失效（旧预检返回必须丢弃）', () => {
    const guard = new SubmitSessionGuard();
    const oldToken = guard.begin();
    const newToken = guard.begin();
    expect(guard.isCurrent(oldToken)).toBe(false);
    expect(guard.isCurrent(newToken)).toBe(true);
  });

  it('弹窗关闭（invalidate）后所有在途令牌失效', () => {
    const guard = new SubmitSessionGuard();
    const token = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(token)).toBe(false);
    // 关闭后重开的新提交是新令牌
    expect(guard.isCurrent(guard.begin())).toBe(true);
  });
});

describe('decideUserDetailRefill（回归 r9-2：详情重取不覆盖用户输入）', () => {
  it('未初始化 → initialize', () => {
    expect(
      decideUserDetailRefill({ initialized: false, versionChanged: true, formMatchesInitial: true }),
    ).toBe('initialize');
  });

  it('已初始化且版本未变 → noop（避免每次渲染回填）', () => {
    expect(
      decideUserDetailRefill({ initialized: true, versionChanged: false, formMatchesInitial: true }),
    ).toBe('noop');
    expect(
      decideUserDetailRefill({ initialized: true, versionChanged: false, formMatchesInitial: false }),
    ).toBe('noop');
  });

  it('后台重取到新版本且表单干净 → refill（旧值不再永久压过新值）', () => {
    expect(
      decideUserDetailRefill({ initialized: true, versionChanged: true, formMatchesInitial: true }),
    ).toBe('refill');
  });

  it('后台重取到新版本但用户已改动 → warn-keep（不覆盖新值，只提示复核）', () => {
    expect(
      decideUserDetailRefill({ initialized: true, versionChanged: true, formMatchesInitial: false }),
    ).toBe('warn-keep');
  });
});
