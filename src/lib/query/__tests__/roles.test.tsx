import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { requestAccessRefresh } from '../../access/service';
import { systemApi } from '../../api/system';
import { queryKeys } from '../keys';
import { useCreateRole, useUpdateRole, useValidRole, useInvalidRole } from '../hooks/useRoles';

vi.mock('../../access/service', () => ({ requestAccessRefresh: vi.fn() }));

const clients: QueryClient[] = [];
function client() {
  const result = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
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
