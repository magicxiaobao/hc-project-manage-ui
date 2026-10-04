/**
 * P2 p2-version-slices：版本表单纯函数测试（src/lib/version-form.ts）。
 *
 * 校验口径忠实于老前端 VersionForm.vue：
 * - name 必填 2～100；versionNumber 必填 1～50；description ≤2000
 * - versionType 必填（四个前端常量）；assigneeId 正整数或留空
 * - 日期 'YYYY-MM-DD[THH:mm:ss]' 合法性；plannedEndDate ≥ plannedStartDate
 * - 校验收集全部错误（不首错即停）
 * - 载荷构建：新建裁空白/空值省略；更新为字段级局部更新（空白省略，后端
 *   BaseVersionUpdater 只更新非 null 字段；契约测试断言的省略形态）
 *
 * 运行：pnpm vitest run src/lib/__tests__/version-form.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  buildVersionCreatePayload,
  buildVersionUpdatePayload,
  editFormFromVersion,
  emptyVersionFormInput,
  validateVersionFormInput,
} from '../version-form';
import type { VersionFormInput } from '../version-form';
import type { VersionResponse } from '../api/version-types';

function form(overrides: Partial<VersionFormInput> = {}): VersionFormInput {
  return {
    ...emptyVersionFormInput(),
    name: '用户中心 v2.0',
    versionNumber: '2.0.0',
    versionType: '次版本',
    ...overrides,
  };
}

function response(overrides: Partial<VersionResponse> = {}): VersionResponse {
  return {
    id: 3101,
    createdAt: 1728000000,
    updatedAt: 1728000000,
    name: '用户中心 v2.0',
    versionNumber: '2.0.0',
    description: '范围说明',
    versionType: '次版本',
    status: 'DEVELOPMENT',
    projectId: 7,
    assigneeId: 9,
    plannedStartDate: '2026-10-01T00:00:00',
    plannedEndDate: '2026-11-01T00:00:00',
    actualStartDate: null,
    actualEndDate: null,
    plannedReleaseDate: '2026-11-15T00:00:00',
    tags: 'web,app',
    ...overrides,
  };
}

describe('emptyVersionFormInput / editFormFromVersion', () => {
  it('空表单：versionType 默认为"次版本"（与老前端一致）', () => {
    const input = emptyVersionFormInput();
    expect(input.versionType).toBe('次版本');
    expect(input.name).toBe('');
  });

  it('回填：null 字段转为空字符串', () => {
    const input = editFormFromVersion(response({ description: null, tags: null, assigneeId: null }));
    expect(input.description).toBe('');
    expect(input.tags).toBe('');
    expect(input.assigneeId).toBe('');
    expect(input.plannedStartDate).toBe('2026-10-01T00:00:00');
  });
});

describe('validateVersionFormInput 校验', () => {
  it('合法输入 → 空错误', () => {
    expect(validateVersionFormInput(form())).toEqual([]);
  });

  it('name 为空/1 字符/101 字符 → 字段级报错', () => {
    expect(validateVersionFormInput(form({ name: '  ' }))).toContainEqual(
      expect.objectContaining({ field: 'name' }),
    );
    expect(validateVersionFormInput(form({ name: 'x' }))).toContainEqual(
      expect.objectContaining({ field: 'name' }),
    );
    expect(validateVersionFormInput(form({ name: 'x'.repeat(101) }))).toContainEqual(
      expect.objectContaining({ field: 'name' }),
    );
  });

  it('versionNumber 为空/51 字符 → 字段级报错', () => {
    expect(validateVersionFormInput(form({ versionNumber: '' }))).toContainEqual(
      expect.objectContaining({ field: 'versionNumber' }),
    );
    expect(validateVersionFormInput(form({ versionNumber: 'x'.repeat(51) }))).toContainEqual(
      expect.objectContaining({ field: 'versionNumber' }),
    );
  });

  it('description 超 2000 字符 → 字段级报错', () => {
    expect(validateVersionFormInput(form({ description: 'x'.repeat(2001) }))).toContainEqual(
      expect.objectContaining({ field: 'description' }),
    );
  });

  it('versionType 非法 → 字段级报错', () => {
    expect(validateVersionFormInput(form({ versionType: '大版本' }))).toContainEqual(
      expect.objectContaining({ field: 'versionType' }),
    );
  });

  it('assigneeId 非法 → 字段级报错；留空通过', () => {
    expect(validateVersionFormInput(form({ assigneeId: 'abc' }))).toContainEqual(
      expect.objectContaining({ field: 'assigneeId' }),
    );
    expect(validateVersionFormInput(form({ assigneeId: '12' }))).toEqual([]);
  });

  it('日期格式非法 → 字段级报错（月份 13、非法串）', () => {
    expect(
      validateVersionFormInput(form({ plannedStartDate: '2026-13-01' })),
    ).toContainEqual(expect.objectContaining({ field: 'plannedStartDate' }));
    expect(
      validateVersionFormInput(form({ plannedReleaseDate: '明天' })),
    ).toContainEqual(expect.objectContaining({ field: 'plannedReleaseDate' }));
  });

  it('plannedEndDate 早于 plannedStartDate → 字段级报错（日精度口径）', () => {
    const errors = validateVersionFormInput(
      form({ plannedStartDate: '2026-11-01', plannedEndDate: '2026-10-01' }),
    );
    expect(errors).toContainEqual(expect.objectContaining({ field: 'plannedEndDate' }));
  });

  it('收集全部错误：多字段同时非法时一次返回多条', () => {
    const errors = validateVersionFormInput(
      form({ name: '', versionNumber: '', plannedStartDate: '2026-13-01' }),
    );
    const fields = errors.map((error) => error.field);
    expect(fields).toContain('name');
    expect(fields).toContain('versionNumber');
    expect(fields).toContain('plannedStartDate');
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildVersionCreatePayload 载荷构建', () => {
  it('裁空白、空可选字段省略、projectId 落位', () => {
    const payload = buildVersionCreatePayload(
      form({ name: '  用户中心 v2.0  ', assigneeId: '9', tags: '' }),
      7,
    );
    expect(payload).toEqual({
      projectId: 7,
      name: '用户中心 v2.0',
      versionNumber: '2.0.0',
      description: '',
      versionType: '次版本',
      assigneeId: 9,
      plannedStartDate: undefined,
      plannedEndDate: undefined,
      plannedReleaseDate: undefined,
      tags: undefined,
    });
  });

  it('非法 versionType 被收窄为"次版本"', () => {
    const payload = buildVersionCreatePayload(form({ versionType: '大版本' }), 7);
    expect(payload.versionType).toBe('次版本');
  });
});

describe('buildVersionUpdatePayload 字段级更新', () => {
  it('空白的可选字段被省略（undefined），JSON 序列化后丢弃 = 后端保留原值', () => {
    const payload = buildVersionUpdatePayload(3101, form({ description: '', tags: '  ' }));
    expect(payload.id).toBe(3101);
    expect(payload.description).toBeUndefined();
    expect(payload.tags).toBeUndefined();
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      id: 3101,
      name: '用户中心 v2.0',
      versionNumber: '2.0.0',
      versionType: '次版本',
    });
  });

  it('填写的字段原样发送（trim 后）', () => {
    const payload = buildVersionUpdatePayload(
      3101,
      form({ description: ' 调整了范围 ', assigneeId: '12', plannedStartDate: '2026-10-01' }),
    );
    expect(payload.description).toBe('调整了范围');
    expect(payload.assigneeId).toBe(12);
    expect(payload.plannedStartDate).toBe('2026-10-01');
  });

  it('projectId 不出现在更新载荷中（项目归属不允许变更）', () => {
    const payload = buildVersionUpdatePayload(3101, form());
    expect(payload).not.toHaveProperty('projectId');
  });
});
