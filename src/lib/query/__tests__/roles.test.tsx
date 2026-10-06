import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { requestAccessRefresh } from '../../access/service';
import { systemApi } from '../../api/system';
import type { RoleResponse } from '../../api/system-types';
import { queryKeys } from '../keys';
import { useCreateRole, useUpdateRole, useValidRole, useInvalidRole, useRoleListAll } from '../hooks/useRoles';

vi.mock('../../access/service', () => ({ requestAccessRefresh: vi.fn() }));

const clients: QueryClient[] = [];
function client() {
  const result = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(result);
  return result;
}
function mutations(c: QueryClient) {
  let result!: {
    create: ReturnType<typeof useCreateRole>;
    update: ReturnType<typeof useUpdateRole>;
    valid: ReturnType<typeof useValidRole>;
    invalid: ReturnType<typeof useInvalidRole>;
  };
  function Probe() {
    result = {
      create: useCreateRole(),
      update: useUpdateRole(),
      valid: useValidRole(),
      invalid: useInvalidRole(),
    };
    return null;
  }
  renderToString(<QueryClientProvider client={c}><Probe /></QueryClientProvider>);
  return result;
}
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function roleList(c: QueryClient) {
  let result!: ReturnType<typeof useRoleListAll>;
  function Probe() {
    result = useRoleListAll();
    return null;
  }
  renderToString(<QueryClientProvider client={c}><Probe /></QueryClientProvider>);
  return result;
}
const role = (id: number): RoleResponse => ({
  id,
  roleName: `角色${id}`,
  roleCode: `ROLE_${id}`,
  description: null,
  enabled: true,
  createdAt: null,
  updatedAt: null,
});
describe('角色全量分页', () => {
  it('服务端压缩页大小为 20 时读取全部页，请求仍使用 100', async () => {
    const rows = Array.from({ length: 45 }, (_, index) => role(index + 1));
    const find = vi.spyOn(systemApi.role, 'findByPage').mockImplementation(async ({ page }) => ({
      list: rows.slice((page - 1) * 20, page * 20),
      pageNumber: page,
      pageSize: 20,
      total: rows.length,
    }));
    const result = await roleList(client()).refetch({ throwOnError: true });
    expect(result.data).toEqual(rows);
    expect(find).toHaveBeenCalledTimes(3);
    for (let page = 1; page <= 3; page++)
      expect(find).toHaveBeenNthCalledWith(page, { page, pageSize: 100, bean: {} });
  });
  it('页间大小变化时拒绝整份列表，不缓存已读取的部分', async () => {
    const c = client();
    const find = vi.spyOn(systemApi.role, 'findByPage')
      .mockResolvedValueOnce({ list: [role(1), role(2)], pageNumber: 1, pageSize: 2, total: 3 })
      .mockResolvedValueOnce({ list: [role(3)], pageNumber: 2, pageSize: 1, total: 3 });
    await expect(roleList(c).refetch({ throwOnError: true })).rejects.toThrow('分页大小发生变化，请重新加载');
    expect(find).toHaveBeenCalledTimes(2);
    expect(c.getQueryData(queryKeys.system.list({ kind: 'roleListAll', pageSize: 100, bean: {} }))).toBeUndefined();
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('拒绝非法页大小 %s', async (pageSize) => {
    vi.spyOn(systemApi.role, 'findByPage').mockResolvedValue({ list: [], pageNumber: 1, pageSize, total: 0 });
    await expect(roleList(client()).refetch({ throwOnError: true })).rejects.toThrow('角色分页响应异常');
  });
  it('拒绝超过服务端页大小的列表', async () => {
    vi.spyOn(systemApi.role, 'findByPage').mockResolvedValue({ list: [role(1), role(2)], pageNumber: 1, pageSize: 1, total: 2 });
    await expect(roleList(client()).refetch({ throwOnError: true })).rejects.toThrow('角色分页响应异常');
  });
});

const cases = [
  { method: 'updateRole', invoke: (m: ReturnType<typeof mutations>) => m.update.mutateAsync({ id: 7, enabled: false }) },
  { method: 'validRole', invoke: (m: ReturnType<typeof mutations>) => m.valid.mutateAsync(7) },
  { method: 'invalidRole', invoke: (m: ReturnType<typeof mutations>) => m.invalid.mutateAsync(7) },
] as const;

describe('角色授权变更刷新', () => {
  it.each(cases)('$method 成功失效 system 缓存并立即请求权限刷新', async ({ method, invoke }) => {
    const c = client();
    const invalidate = vi.spyOn(c, 'invalidateQueries');
    vi.spyOn(systemApi.role, method).mockResolvedValue('success');
    await invoke(mutations(c));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.system.all });
    expect(requestAccessRefresh).toHaveBeenCalledExactlyOnceWith('authorization-change');
  });
  it.each(cases)('$method 失败不请求权限刷新或失效缓存', async ({ method, invoke }) => {
    const c = client();
    const invalidate = vi.spyOn(c, 'invalidateQueries');
    vi.spyOn(systemApi.role, method).mockRejectedValue(new Error('保存失败'));
    await expect(invoke(mutations(c))).rejects.toThrow('保存失败');
    expect(invalidate).not.toHaveBeenCalled();
    expect(requestAccessRefresh).not.toHaveBeenCalled();
  });
  it('新建角色成功仍只失效列表缓存', async () => {
    const c = client();
    const invalidate = vi.spyOn(c, 'invalidateQueries');
    vi.spyOn(systemApi.role, 'createRole').mockResolvedValue(7);
    await mutations(c).create.mutateAsync({ roleName: '角色', roleCode: 'ROLE' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.system.all });
    expect(requestAccessRefresh).not.toHaveBeenCalled();
  });
});
