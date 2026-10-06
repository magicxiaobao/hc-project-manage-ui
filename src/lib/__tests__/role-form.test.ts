/**
 * p5-role-list：角色表单纯函数与查询映射的单元测试。
 *
 * 回归目标：
 * - 校验收集全部错误（不首错即停），必填挂到对应字段；
 * - 新建/更新载荷与表单同源（trim、新建空描述→null、更新空描述→''显式清空、
 *   enabled 透传）；
 * - 角色编码唯一性预检必须按 roleCode 精确匹配（不区分大小写，DB 唯一索引
 *   collation 为 utf8mb4_unicode_ci）：GET /role/v1/list?keyword= 有
 *   LIKE-OR 缺括号 bug（backend-memo-p5.md §5），名称命中的禁用角色会漏进
 *   结果——只看"返回非空"会误杀合法编码；
 * - 搜索表单 → RoleQuery bean 映射：空值不进 bean；
 * - 本地全量过滤 filterRolesLocal：服务端筛选是空操作，必须在全量上过滤。
 */
import { describe, expect, it } from 'vitest';
import {
  buildRoleCreatePayload,
  buildRoleUpdatePayload,
  decideRoleSubmitFailure,
  emptyRoleFormInput,
  isRoleCodeTaken,
  rebaseRoleFormOnVersionConflict,
  roleFormInputFromResponse,
  validateRoleFormInput,
  type RoleFormInput,
} from '../role-form';
import { ApiBusinessError } from '../api/client';
import { buildRoleQuery, filterRolesLocal, normalizeRoleListParams } from '../query/hooks/useRoles';
import type { RoleResponse } from '../api/system-types';

const validInput: RoleFormInput = {
  roleName: '项目管理员',
  roleCode: 'PROJECT_MANAGER',
  description: '管理项目',
  enabled: true,
};

describe('validateRoleFormInput', () => {
  it('合法输入零错误', () => {
    expect(validateRoleFormInput(validInput)).toEqual([]);
  });

  it('空表单收集全部必填错误（不首错即停）', () => {
    const errors = validateRoleFormInput(emptyRoleFormInput());
    expect(errors).toEqual([
      { field: 'roleName', message: '角色名称不能为空' },
      { field: 'roleCode', message: '角色编码不能为空' },
    ]);
  });

  it('纯空格视为未填', () => {
    const errors = validateRoleFormInput({
      ...validInput,
      roleName: '   ',
      roleCode: '\t',
    });
    expect(errors.map((e) => e.field)).toEqual(['roleName', 'roleCode']);
  });

  it('只缺 roleCode 时只报 roleCode', () => {
    const errors = validateRoleFormInput({ ...validInput, roleCode: '' });
    expect(errors).toEqual([{ field: 'roleCode', message: '角色编码不能为空' }]);
  });

  it('description/enabled 不参与必填校验', () => {
    const errors = validateRoleFormInput({
      ...validInput,
      description: '',
      enabled: false,
    });
    expect(errors).toEqual([]);
  });
});

describe('buildRoleCreatePayload / buildRoleUpdatePayload', () => {
  it('新建载荷：trim + 空描述→null + enabled 透传', () => {
    expect(
      buildRoleCreatePayload({
        ...validInput,
        roleName: '  项目管理员  ',
        roleCode: '  PROJECT_MANAGER ',
        description: '   ',
      }),
    ).toEqual({
      roleName: '项目管理员',
      roleCode: 'PROJECT_MANAGER',
      description: null,
      enabled: true,
    });
  });

  it('新建载荷保留 enabled=false', () => {
    const payload = buildRoleCreatePayload({ ...validInput, enabled: false });
    expect(payload.enabled).toBe(false);
  });

  it('更新载荷带 id 且字段全量', () => {
    expect(buildRoleUpdatePayload(7, validInput)).toEqual({
      id: 7,
      roleName: '项目管理员',
      roleCode: 'PROJECT_MANAGER',
      description: '管理项目',
      enabled: true,
    });
  });

  it('更新载荷：空描述发 \'\'（显式清空），而非 null', () => {
    // 回归（run213-codex-pi-P5-r24-4）：后端 BaseRoleUpdater.updateRole 用
    // Optional.ofNullable 更新，null=跳过该字段。编辑已有描述的角色、删掉
    // 描述后保存，必须发 '' 才能真正清空；发 null 会导致旧描述仍在。
    const payload = buildRoleUpdatePayload(7, { ...validInput, description: '   ' });
    expect(payload.description).toBe('');
  });

  it('更新载荷：仅空格的描述不转 null', () => {
    const payload = buildRoleUpdatePayload(7, { ...validInput, description: '' });
    expect(payload.description).toBe('');
  });
});

describe('emptyRoleFormInput / roleFormInputFromResponse', () => {
  it('空表单默认启用', () => {
    expect(emptyRoleFormInput().enabled).toBe(true);
  });

  it('回填：null 字段转空串', () => {
    expect(
      roleFormInputFromResponse({
        id: 1,
        roleName: null,
        roleCode: 'ADMIN',
        description: null,
        enabled: true,
        createdAt: null,
        updatedAt: null,
      }),
    ).toEqual({ roleName: '', roleCode: 'ADMIN', description: '', enabled: true });
  });

  it('回填：enabled=null 回退为 true（不静默写成禁用）', () => {
    const form = roleFormInputFromResponse({
      id: 1,
      roleName: '管理员',
      roleCode: 'ADMIN',
      description: null,
      enabled: null,
      createdAt: null,
      updatedAt: null,
    });
    expect(form.enabled).toBe(true);
  });
});

describe('isRoleCodeTaken', () => {
  const candidates = [
    { id: 1, roleCode: 'ADMIN' },
    { id: 2, roleCode: 'PROJECT_MANAGER' },
  ];

  it('精确命中返回 true', () => {
    expect(isRoleCodeTaken(candidates, 'ADMIN', null)).toBe(true);
  });

  it('大小写不同算命中（DB collation utf8mb4_unicode_ci 不区分大小写）', () => {
    // 回归（run213-codex-pi-P5-r24-5）：原断言 ADMIN 不占用 admin 是错误的；
    // 已有启用 ADMIN 时新建 admin 预检必须放行失败，否则 POST 被 DB 拒绝。
    expect(isRoleCodeTaken(candidates, 'admin', null)).toBe(true);
    expect(isRoleCodeTaken(candidates, 'Admin', null)).toBe(true);
    expect(isRoleCodeTaken(candidates, 'PROJECT_manager', null)).toBe(true);
  });

  it('前后缀/子串不算命中（仍是精确匹配，不含仅名称命中）', () => {
    expect(isRoleCodeTaken(candidates, 'ADMIN2', null)).toBe(false);
    expect(isRoleCodeTaken(candidates, 'DMI', null)).toBe(false);
  });

  it('LIKE-OR bug 回归：仅名称命中的结果不算编码冲突', () => {
    // 后端按 keyword=ADMIN 做 roleName LIKE OR roleCode LIKE（缺括号），
    // 名称含 ADMIN 的禁用角色会漏进结果；预检必须按 roleCode 精确匹配，
    // 不能只看返回非空。
    const nameMatchedOnly = [{ id: 9, roleCode: 'OLD_ADMIN_READONLY' }];
    expect(isRoleCodeTaken(nameMatchedOnly, 'ADMIN', null)).toBe(false);
  });

  it('编辑模式排除自身 id', () => {
    expect(isRoleCodeTaken(candidates, 'ADMIN', 1)).toBe(false);
    expect(isRoleCodeTaken(candidates, 'ADMIN', 2)).toBe(true);
  });

  it('空结果不算冲突', () => {
    expect(isRoleCodeTaken([], 'ADMIN', null)).toBe(false);
  });
});

describe('rebaseRoleFormOnVersionConflict', () => {
  const baseline: RoleFormInput = {
    roleName: '旧名称',
    roleCode: 'OLD_CODE',
    description: '旧描述',
    enabled: true,
  };
  const server: RoleFormInput = {
    roleName: '新名称',
    roleCode: 'OLD_CODE',
    description: '新描述',
    enabled: false,
  };

  it('用户改过的字段保留，未改动的取服务端值', () => {
    const rebased = rebaseRoleFormOnVersionConflict({
      baseline,
      current: { ...baseline, description: '我的描述' },
      server,
    });
    expect(rebased).toEqual({
      roleName: '新名称',
      roleCode: 'OLD_CODE',
      description: '我的描述',
      enabled: false,
    });
  });

  it('用户未改动时整体同步为服务端值', () => {
    const rebased = rebaseRoleFormOnVersionConflict({
      baseline,
      current: { ...baseline },
      server,
    });
    expect(rebased).toEqual(server);
  });

  it('baseline=null 时以 server 为比较基线，不丢弃用户输入', () => {
    const rebased = rebaseRoleFormOnVersionConflict({
      baseline: null,
      current: { ...server, roleName: '我的改名' },
      server,
    });
    expect(rebased.roleName).toBe('我的改名');
    expect(rebased.enabled).toBe(false);
  });
});

describe('buildRoleQuery', () => {
  it('空值不产生任何查询字段', () => {
    expect(buildRoleQuery('', '')).toEqual({});
    expect(buildRoleQuery('   ', '\t')).toEqual({});
  });

  it('roleName/roleCode 非空时分别填入 bean', () => {
    expect(buildRoleQuery('管理员', '')).toEqual({ roleName: '管理员' });
    expect(buildRoleQuery('', 'ADMIN')).toEqual({ roleCode: 'ADMIN' });
    expect(buildRoleQuery('管理员', 'ADMIN')).toEqual({
      roleName: '管理员',
      roleCode: 'ADMIN',
    });
  });

  it('两端空白被 trim', () => {
    expect(buildRoleQuery('  管理员  ', '  ADMIN ')).toEqual({
      roleName: '管理员',
      roleCode: 'ADMIN',
    });
  });
});

describe('filterRolesLocal', () => {
  // 后端 RoleServiceImpl.findByPage 不读 bean（服务端空操作，2026-10-05 实读
  // 确认），故列表页用 useRoleListAll 拉全量后在此做本地过滤。回归目标：
  // - 必须在全量上过滤（仅过滤当前页不能代替服务端筛选）；
  // - 口径为不区分大小写的子串匹配（近似 MySQL LIKE / utf8mb4_unicode_ci）。
  const roles = [
    { id: 1, roleName: '项目管理员', roleCode: 'PROJECT_MANAGER' },
    { id: 2, roleName: '系统管理员', roleCode: 'ADMIN' },
    { id: 3, roleName: '只读访客', roleCode: 'GUEST_READONLY' },
  ] as RoleResponse[];

  it('空筛选返回全量', () => {
    expect(filterRolesLocal(roles, '', '')).toHaveLength(3);
  });

  it('按 roleName 子串过滤', () => {
    expect(filterRolesLocal(roles, '管理员', '').map((r) => r.id)).toEqual([1, 2]);
  });

  it('按 roleCode 子串过滤（不区分大小写）', () => {
    expect(filterRolesLocal(roles, '', 'admin').map((r) => r.id)).toEqual([2]);
    expect(filterRolesLocal(roles, '', 'READONLY').map((r) => r.id)).toEqual([3]);
  });

  it('名称与编码同时过滤取交集', () => {
    expect(filterRolesLocal(roles, '管理', 'ADMIN').map((r) => r.id)).toEqual([2]);
  });

  it('两端空白被 trim', () => {
    expect(filterRolesLocal(roles, '  管理员  ', '').map((r) => r.id)).toEqual([1, 2]);
  });

  it('null 字段防御：roleName=null 的行不因名称筛选崩溃', () => {
    const withNull = [...roles, { id: 4, roleName: null, roleCode: 'X' } as RoleResponse];
    expect(filterRolesLocal(withNull, '管理员', '').map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('normalizeRoleListParams', () => {
  it('默认 page/pageSize，搜索参数进入 bean', () => {
    expect(normalizeRoleListParams({})).toEqual({
      page: 1,
      pageSize: 20,
      bean: {},
    });
  });

  it('分页与筛选透传', () => {
    expect(
      normalizeRoleListParams({ page: 2, pageSize: 10, roleName: ' 管理 ', roleCode: 'PM' }),
    ).toEqual({
      page: 2,
      pageSize: 10,
      bean: { roleName: '管理', roleCode: 'PM' },
    });
  });
});

describe('decideRoleSubmitFailure', () => {
  // 回归（run216-codex-pi-P5-r25-1）：后端真相实读确认——
  // RoleServiceImpl 未注入自定义 errorHook，EntityCreator/EntityUpdater 的默认
  // errorHook 把 insert/update 失败包装为 BusinessException(SaveError=10002 /
  // UpdateError=10003)（HTTP 400）；10112 = AuthErrorEnum.RequestFail 只是
  // GlobalExceptionHandler 对 RuntimeException 的兜底码（HTTP 500），绝不代表
  // 编码冲突。
  const businessError = (code: number, httpStatus = 400) =>
    new ApiBusinessError({ code, msg: '业务异常', result: null }, httpStatus);

  it('10002（新建 SaveError）→ roleCode 字段级错误、措辞谨慎（"可能"类，不断言"已存在"）', () => {
    const decision = decideRoleSubmitFailure(businessError(10002), true);
    expect(decision.roleCodeError).toContain('可能');
    expect(decision.roleCodeError).toContain('也可能是其它字段冲突');
    expect(decision.roleCodeError).not.toContain('已存在');
    expect(decision.clearOverall).toBe(true);
    expect(decision.overallError).toBeNull();
  });

  it('10003（更新 UpdateError）→ roleCode 字段级错误、措辞谨慎', () => {
    const decision = decideRoleSubmitFailure(businessError(10003), false);
    expect(decision.roleCodeError).toContain('可能');
    expect(decision.roleCodeError).not.toContain('已存在');
    expect(decision.clearOverall).toBe(true);
    expect(decision.overallError).toBeNull();
  });

  it('10112（服务端兜底 500）→ 中性字段提示 + 整体失败说明保留，不断言"编码已存在"', () => {
    const decision = decideRoleSubmitFailure(businessError(10112, 500), true);
    expect(decision.roleCodeError).toBe('提交失败，请检查表单后重试');
    expect(decision.roleCodeError).not.toContain('编码');
    expect(decision.clearOverall).toBe(false);
    expect(decision.overallError).toContain('创建失败');
  });

  it('10112 在编辑模式 → 整体文案用"更新失败"', () => {
    const decision = decideRoleSubmitFailure(businessError(10112, 500), false);
    expect(decision.overallError).toContain('更新失败');
    expect(decision.clearOverall).toBe(false);
  });

  it('其它未知业务码 → 中性失败分支、保留整体说明', () => {
    const decision = decideRoleSubmitFailure(businessError(10999), true);
    expect(decision.roleCodeError).toBe('提交失败，请检查表单后重试');
    expect(decision.clearOverall).toBe(false);
    expect(decision.overallError).toContain('创建失败');
  });

  it('非业务错误（网络 Error）→ 中性失败分支', () => {
    const decision = decideRoleSubmitFailure(new Error('Network Error'), true);
    expect(decision.clearOverall).toBe(false);
    expect(decision.overallError).toBe('创建失败：Network Error');
  });
});
