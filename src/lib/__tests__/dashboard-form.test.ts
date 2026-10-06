import { describe, expect, it } from 'vitest';
import type { DashboardResponse } from '../api/dashboard-types';
import { buildDashboardCreatePayload, buildDashboardUpdatePayload, dashboardInitial, formDirty, integerError, validId, validateDashboardForm } from '../dashboard-form';

describe('DashboardForm 校验与白名单', () => {
  it('一次收集所有错误，名称/ID/INT/间隔/theme 都校验', () => {
    expect(validateDashboardForm({ ...dashboardInitial(), dashboardName: ' ', sortOrder: '1.5', autoRefresh: true, refreshInterval: '0', theme: 'a'.repeat(21) }, 0).map(error => error.field)).toEqual(['dashboardName', 'projectId', 'sortOrder', 'refreshInterval', 'theme']);
  });
  it('名称长度和正 safe ID 边界，false/0 保留', () => {
    expect(validateDashboardForm({ ...dashboardInitial(), dashboardName: 'a'.repeat(200), refreshInterval: '0', isPublic: false }, Number.MAX_SAFE_INTEGER)).toEqual([]);
    expect(validateDashboardForm({ ...dashboardInitial(), dashboardName: 'a'.repeat(201) }, 1)).toHaveLength(1);
    for (const id of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(validId(id)).toBe(false);
  });
  it('数字规则拒绝混合文本/非整数/溢出，接受 INT 边界', () => {
    for (const number of ['1x', '1.1', 'NaN', 'Infinity', '2147483648', '-2147483649', '1e2', '0x10']) expect(integerError(number)).toBeTruthy();
    for (const number of ['0', '-2147483648', '2147483647']) expect(integerError(number)).toBeUndefined();
    expect(integerError(null, 1, true)).toBeTruthy();
  });
  it('创建/编辑白名单不提交受控字段，文本清空与 nullable 不补默认', () => {
    const input = { ...dashboardInitial(), dashboardName: ' 名称 ', description: '', isPublic: false, sortOrder: '0' };
    expect(JSON.parse(JSON.stringify(buildDashboardCreatePayload(input, 3)))).toEqual({ dashboardName: '名称', description: '', isPublic: false, sortOrder: 0, refreshInterval: 300, autoRefresh: false, theme: 'light', projectId: 3 });
    const nullable = dashboardInitial({ dashboardName: '名称', description: null, sortOrder: null, refreshInterval: null, autoRefresh: null, isPublic: null, theme: null } as DashboardResponse);
    expect(JSON.parse(JSON.stringify(buildDashboardUpdatePayload(nullable, 7)))).toEqual({ id: 7, dashboardName: '名称' });
    expect(buildDashboardUpdatePayload({ ...nullable, description: '' }, 7).description).toBe('');
    expect(buildDashboardUpdatePayload(input, 7)).not.toHaveProperty('projectId');
  });
  it('初始 clean、修改 dirty、改回 clean，null 与显式空文本不同', () => {
    const initial = dashboardInitial();
    expect(formDirty(initial, initial)).toBe(false);
    expect(formDirty({ ...initial, description: '修改' }, initial)).toBe(true);
    expect(formDirty({ ...initial, description: initial.description }, initial)).toBe(false);
    expect(formDirty({ ...initial, description: null }, initial)).toBe(true);
  });
});
