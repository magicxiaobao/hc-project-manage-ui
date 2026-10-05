/**
 * P2 p2-release-env：发布环境表单纯函数测试（src/lib/release-environment-form.ts）。
 *
 * 校验口径忠实于后端 ReleaseEnvironmentService + 老前端 ReleaseEnvironmentForm.vue：
 * - name 必填且 ≤100 码点；category 必填（四类）；order 必填、非负整数、
 *   ≤2147483647（超限挂字段错误）；校验收集全部错误（不首错即停）
 * - 载荷构建：新建五项全送（生产环境 approvalRequired 强制 true）；
 *   更新 {id, name, order} + ACTIVE 环境必填 approvalRequired、INACTIVE 环境
 *   必须省略；category 不可改、不出现在更新载荷中
 * - 停用原因：必填（strip 后非空）且 ≤500 码点；长度按 Unicode 码点计数
 *
 * 运行：pnpm vitest run src/lib/__tests__/release-environment-form.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH,
  RELEASE_ENVIRONMENT_NAME_MAX_LENGTH,
  RELEASE_ENVIRONMENT_ORDER_MAX,
  buildEnvironmentCreatePayload,
  buildEnvironmentUpdatePayload,
  categoryForcesApproval,
  codePointLength,
  editFormFromEnvironment,
  emptyEnvironmentFormInput,
  validateDisableReason,
  validateEnvironmentFormInput,
} from '../release-environment-form';
import type { ReleaseEnvironmentFormInput } from '../release-environment-form';
import type { ReleaseEnvironmentResponse } from '../api/releaseEnvironment-types';

function form(overrides: Partial<ReleaseEnvironmentFormInput> = {}): ReleaseEnvironmentFormInput {
  return {
    ...emptyEnvironmentFormInput(),
    name: '预发布环境',
    category: 'STAGING',
    order: '1',
    approvalRequired: true,
    ...overrides,
  };
}

function response(overrides: Partial<ReleaseEnvironmentResponse> = {}): ReleaseEnvironmentResponse {
  return {
    id: 510,
    projectId: 7,
    name: '预发布环境',
    category: 'STAGING',
    order: 1,
    approvalRequired: true,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('emptyEnvironmentFormInput / editFormFromEnvironment', () => {
  it('空表单：类别默认为开发环境（与老前端一致）', () => {
    const input = emptyEnvironmentFormInput();
    expect(input.category).toBe('DEVELOPMENT');
    expect(input.order).toBe('0');
    expect(input.approvalRequired).toBe(false);
  });

  it('回填：响应字段逐一映射（order 为响应 JSON 字段名）', () => {
    const input = editFormFromEnvironment(response({ order: 3, approvalRequired: false }));
    expect(input).toEqual({ name: '预发布环境', category: 'STAGING', order: '3', approvalRequired: false });
  });
});

describe('validateEnvironmentFormInput', () => {
  it('合法输入：零错误', () => {
    expect(validateEnvironmentFormInput(form(), 'ACTIVE')).toEqual([]);
    expect(validateEnvironmentFormInput(form(), null)).toEqual([]);
  });

  it('收集全部错误：名称空 + 类别非法 + 排序非法一次挂出', () => {
    const errors = validateEnvironmentFormInput(
      form({ name: '  ', category: 'UNKNOWN', order: 'abc' }),
      null,
    );
    expect(errors.map((error) => error.field).sort()).toEqual(['category', 'name', 'order']);
  });

  it('名称：空白必填；超 100 码点挂错（emoji 按码点计数）', () => {
    expect(validateEnvironmentFormInput(form({ name: '' }), null)).toContainEqual({
      field: 'name',
      message: '环境名称不能为空',
    });
    const over = '环'.repeat(RELEASE_ENVIRONMENT_NAME_MAX_LENGTH + 1);
    expect(validateEnvironmentFormInput(form({ name: over }), null)).toContainEqual({
      field: 'name',
      message: `环境名称不能超过 ${RELEASE_ENVIRONMENT_NAME_MAX_LENGTH} 个字符`,
    });
    // 100 个 emoji = 100 码点（.length=200），应通过
    expect(
      validateEnvironmentFormInput(form({ name: '😀'.repeat(100) }), null),
    ).toEqual([]);
  });

  it('类别：四类之外必填错误', () => {
    expect(validateEnvironmentFormInput(form({ category: '' }), null)).toContainEqual({
      field: 'category',
      message: '请选择环境类别',
    });
  });

  it('排序：空/非整数/负数/超限分别挂字段错误', () => {
    expect(validateEnvironmentFormInput(form({ order: '' }), null)).toContainEqual({
      field: 'order',
      message: '排序不能为空',
    });
    expect(validateEnvironmentFormInput(form({ order: '1.5' }), null)).toContainEqual({
      field: 'order',
      message: '排序必须为非负整数',
    });
    expect(validateEnvironmentFormInput(form({ order: '-1' }), null)).toContainEqual({
      field: 'order',
      message: '排序必须为非负整数',
    });
    expect(
      validateEnvironmentFormInput(form({ order: String(RELEASE_ENVIRONMENT_ORDER_MAX + 1) }), null),
    ).toContainEqual({
      field: 'order',
      message: `排序不能超过 ${RELEASE_ENVIRONMENT_ORDER_MAX}`,
    });
    // 边界：int 最大值通过
    expect(
      validateEnvironmentFormInput(form({ order: String(RELEASE_ENVIRONMENT_ORDER_MAX) }), null),
    ).toEqual([]);
  });
});

describe('buildEnvironmentCreatePayload', () => {
  it('五项全送：名称裁空白、order 解析为数字', () => {
    const payload = buildEnvironmentCreatePayload(form({ name: '  预发  ', order: '07' }), 7);
    expect(payload).toEqual({
      projectId: 7,
      name: '预发',
      category: 'STAGING',
      order: 7,
      approvalRequired: true,
    });
  });

  it('生产环境 approvalRequired 强制为 true（忠实后端）', () => {
    const payload = buildEnvironmentCreatePayload(
      form({ category: 'PRODUCTION', approvalRequired: false }),
      7,
    );
    expect(payload.approvalRequired).toBe(true);
    expect(categoryForcesApproval('PRODUCTION')).toBe(true);
    expect(categoryForcesApproval('STAGING')).toBe(false);
  });

  it('非法类别回退为开发环境', () => {
    const payload = buildEnvironmentCreatePayload(form({ category: 'BOGUS' }), 7);
    expect(payload.category).toBe('DEVELOPMENT');
  });
});

describe('buildEnvironmentUpdatePayload', () => {
  it('ACTIVE 环境：approvalRequired 必填发送；category 不出现在载荷中', () => {
    const payload = buildEnvironmentUpdatePayload(510, form({ approvalRequired: false }), 'ACTIVE');
    expect(payload).toEqual({ id: 510, name: '预发布环境', order: 1, approvalRequired: false });
    expect(payload).not.toHaveProperty('category');
  });

  it('INACTIVE 环境：approvalRequired 必须省略（后端强制）', () => {
    const payload = buildEnvironmentUpdatePayload(510, form({ approvalRequired: true }), 'INACTIVE');
    expect(payload).toEqual({ id: 510, name: '预发布环境', order: 1 });
    expect(payload).not.toHaveProperty('approvalRequired');
  });

  it('ACTIVE + 生产类别：approvalRequired 强制 true', () => {
    const payload = buildEnvironmentUpdatePayload(
      510,
      form({ category: 'PRODUCTION', approvalRequired: false }),
      'ACTIVE',
    );
    expect(payload.approvalRequired).toBe(true);
  });
});

describe('validateDisableReason / codePointLength', () => {
  it('空白原因必填错误', () => {
    expect(validateDisableReason('   ')).toBe('停用原因不能为空（后端必填）。');
  });

  it('超 500 码点挂错；251 个 emoji（.length=502）计 251 码点应通过', () => {
    expect(validateDisableReason('因'.repeat(RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH + 1))).toBe(
      `停用原因不能超过 ${RELEASE_ENVIRONMENT_DISABLE_REASON_MAX_LENGTH} 个字符。`,
    );
    expect(validateDisableReason('😀'.repeat(251))).toBeNull();
    expect(codePointLength('😀'.repeat(251))).toBe(251);
  });

  it('合法原因通过', () => {
    expect(validateDisableReason('环境下线')).toBeNull();
  });
});
