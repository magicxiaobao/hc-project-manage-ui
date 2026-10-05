/**
 * Phase 2 版本列表/详情接入真实后端（p2-version-slices）测试：
 * - useVersionList：POST /version/v1/findByPage，请求参数归一化
 *   （默认值 page=1、pageSize=20、bean={ projectId }）
 * - useVersionList 门控：projectId 为 null → disabled，不发起请求
 * - useCreateVersion：POST /version/v1/createVersion，成功后失效版本域缓存
 * - useTransitionVersion：POST /version/v1/{id}/transition，请求体
 *   { event, expectedStatus, reason? }；expectedStatus 为调用方读到的当前状态
 * - versionTransitionEvents：事件拓扑（忠实于 VERSION_EVENT_SOURCES）
 * - versionEventRequiresReason：原因必填规则（忠实于后端 requiresReason）
 * - buildTransitionVersionOptions.onError：CAS 冲突后回取详情
 * - queryKey 形状约定：['hc', 'version', 'list'|'detail', ...]
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/version-slices.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import {
  buildTransitionVersionOptions,
  normalizeVersionListParams,
  useCreateVersion,
  useTransitionVersion,
  useVersionList,
  versionEventRequiresReason,
  versionTransitionEvents,
} from '../hooks/useVersions';
import { api } from '../../api/client';
import { versionApi } from '../../api/version';
import type { PageResult } from '../../api/types';
import type {
  VersionCreatePayload,
  VersionResponse,
  VersionTransitionPayload,
} from '../../api/version-types';

function version(overrides: Partial<VersionResponse>): VersionResponse {
  return {
    id: 3101,
    createdAt: 1728000000,
    updatedAt: 1728000000,
    name: '用户中心 v2.0',
    versionNumber: '2.0.0',
    description: null,
    versionType: '次版本',
    status: 'DEVELOPMENT',
    projectId: 7,
    assigneeId: null,
    plannedStartDate: null,
    plannedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    plannedReleaseDate: null,
    tags: null,
    ...overrides,
  };
}

function pageResult(list: VersionResponse[]): PageResult<VersionResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

describe('useVersionList 参数归一化（走 hook 内部 normalizeVersionListParams）', () => {
  it('默认值：page=1、pageSize=20、bean.projectId 落位', () => {
    expect(normalizeVersionListParams({ projectId: 7 })).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });
  });

  it('筛选条件 name/版本号/类型/状态全部进入 bean', () => {
    expect(
      normalizeVersionListParams({
        page: 2,
        pageSize: 20,
        bean: { name: '用户中心', versionNumber: '2.0', versionType: '次版本', status: 'TESTING' },
        projectId: 7,
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      bean: { projectId: 7, name: '用户中心', versionNumber: '2.0', versionType: '次版本', status: 'TESTING' },
    });
  });

  it('projectId 缺省 → bean.projectId=0（hook 的 enabled 门控会拦截请求）', () => {
    expect(normalizeVersionListParams().bean.projectId).toBe(0);
  });

  it('versionApi.findByPage 走 POST /version/v1/findByPage，请求体即归一化参数', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([version({ id: 3 })]));
    const client = createQueryClient();
    const params = normalizeVersionListParams({ projectId: 7 });
    const data = await client.fetchQuery({
      queryKey: queryKeys.version.list(params),
      queryFn: () => versionApi.findByPage(params),
    });
    expect(data.list[0]?.id).toBe(3);
    expect(postSpy).toHaveBeenCalledWith('/version/v1/findByPage', params);
  });

  it("queryKey 形状为 ['hc', 'version', 'list', params]", () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    expect(queryKeys.version.list(params)).toEqual(['hc', 'version', 'list', params]);
  });

  it("详情 queryKey 形状为 ['hc', 'version', 'detail', id]", () => {
    expect(queryKeys.version.detail(3101)).toEqual(['hc', 'version', 'detail', 3101]);
  });
});

describe('useVersionList 门控（SSR 冒烟：projectId 为 null 时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('projectId 为 null → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useVersionList({ projectId: null });
      return <div>{`pending:${String(isPending)} fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('pending:true');
    expect(html).toContain('fetch:idle');
    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('versionTransitionEvents 流转拓扑（忠实于 VERSION_EVENT_SOURCES）', () => {
  it('PLANNING → 开始开发/废弃', () => {
    expect(versionTransitionEvents('PLANNING')).toEqual(['START_DEVELOPMENT', 'DEPRECATE']);
  });

  it('DEVELOPMENT → 退回规划/开始测试/废弃', () => {
    expect(versionTransitionEvents('DEVELOPMENT')).toEqual([
      'RETURN_TO_PLANNING',
      'START_TESTING',
      'DEPRECATE',
    ]);
  });

  it('TESTING → 退回开发/冻结/废弃', () => {
    expect(versionTransitionEvents('TESTING')).toEqual([
      'RETURN_TO_DEVELOPMENT',
      'FREEZE',
      'DEPRECATE',
    ]);
  });

  it('FROZEN → 重新测试/废弃', () => {
    expect(versionTransitionEvents('FROZEN')).toEqual(['REOPEN_TESTING', 'DEPRECATE']);
  });

  it('RELEASED → 仅废弃（人工事件不可达 RELEASED）', () => {
    expect(versionTransitionEvents('RELEASED')).toEqual(['DEPRECATE']);
  });

  it('DEPRECATED → 无可用事件（后端拒绝一切更新）', () => {
    expect(versionTransitionEvents('DEPRECATED')).toEqual([]);
  });

  it('未知状态/null → 空列表，不渲染流转按钮', () => {
    expect(versionTransitionEvents('WHATEVER')).toEqual([]);
    expect(versionTransitionEvents(null)).toEqual([]);
  });
});

describe('versionEventRequiresReason 原因必填规则（忠实于后端 requiresReason）', () => {
  it('RETURN_TO_PLANNING / RETURN_TO_DEVELOPMENT / REOPEN_TESTING / DEPRECATE 必填', () => {
    expect(versionEventRequiresReason('RETURN_TO_PLANNING')).toBe(true);
    expect(versionEventRequiresReason('RETURN_TO_DEVELOPMENT')).toBe(true);
    expect(versionEventRequiresReason('REOPEN_TESTING')).toBe(true);
    expect(versionEventRequiresReason('DEPRECATE')).toBe(true);
  });

  it('START_DEVELOPMENT / START_TESTING / FREEZE 不必填', () => {
    expect(versionEventRequiresReason('START_DEVELOPMENT')).toBe(false);
    expect(versionEventRequiresReason('START_TESTING')).toBe(false);
    expect(versionEventRequiresReason('FREEZE')).toBe(false);
  });
});

describe('useTransitionVersion 数据链路（mock api.post）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('请求体 { event, expectedStatus, reason? }，expectedStatus = 读到的当前状态', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('success');
    const client = createQueryClient();
    let mutateAsync:
      | ((variables: { versionId: number; data: VersionTransitionPayload }) => Promise<string>)
      | null = null;
    function SmokeTransition() {
      const mutation = useTransitionVersion();
      mutateAsync = mutation.mutateAsync;
      return null;
    }
    renderToString(
      <QueryClientProvider client={client}>
        <SmokeTransition />
      </QueryClientProvider>,
    );
    expect(mutateAsync).not.toBeNull();
    const payload: VersionTransitionPayload = {
      event: 'START_TESTING',
      expectedStatus: 'DEVELOPMENT',
      reason: '开发完成',
    };
    await mutateAsync!({ versionId: 3101, data: payload });
    expect(postSpy).toHaveBeenCalledWith('/version/v1/3101/transition', payload);
  });

  it('成功后版本域缓存被失效', async () => {
    vi.spyOn(api, 'post').mockResolvedValue('success');
    const client = createQueryClient();
    const listKey = queryKeys.version.list({ page: 1, pageSize: 20, bean: { projectId: 7 } });
    client.setQueryData(listKey, pageResult([]));
    const detailKey = queryKeys.version.detail(3101);
    client.setQueryData(detailKey, version({}));
    let mutateAsync:
      | ((variables: { versionId: number; data: VersionTransitionPayload }) => Promise<string>)
      | null = null;
    function SmokeTransition() {
      const mutation = useTransitionVersion();
      mutateAsync = mutation.mutateAsync;
      return null;
    }
    renderToString(
      <QueryClientProvider client={client}>
        <SmokeTransition />
      </QueryClientProvider>,
    );
    await mutateAsync!({
      versionId: 3101,
      data: { event: 'FREEZE', expectedStatus: 'TESTING' },
    });
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it('onError（乐观并发冲突）→ 详情缓存被失效，弹窗可重取最新状态', () => {
    const client = createQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const options = buildTransitionVersionOptions(client);
    options.onError(new Error('conflict'), {
      versionId: 3101,
      data: { event: 'FREEZE', expectedStatus: 'TESTING' },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.version.detail(3101),
    });
  });
});

describe('useCreateVersion 数据链路（mock api.post）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('提交载荷并返回新建 id，成功后版本域缓存被失效', async () => {
    const payload: VersionCreatePayload = {
      projectId: 7,
      name: '用户中心 v2.0',
      versionNumber: '2.0.0',
      description: '',
      versionType: '次版本',
    };
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(3101);
    const client = createQueryClient();
    // 预置列表缓存，验证失效确实命中版本域
    const listKey = queryKeys.version.list({ page: 1, pageSize: 20, bean: { projectId: 7 } });
    client.setQueryData(listKey, pageResult([]));
    let mutateAsync: ((data: VersionCreatePayload) => Promise<number>) | null = null;
    function SmokeCreate() {
      const mutation = useCreateVersion();
      mutateAsync = mutation.mutateAsync;
      return null;
    }
    renderToString(
      <QueryClientProvider client={client}>
        <SmokeCreate />
      </QueryClientProvider>,
    );
    expect(mutateAsync).not.toBeNull();
    const id = await mutateAsync!(payload);
    expect(id).toBe(3101);
    expect(postSpy).toHaveBeenCalledWith('/version/v1/createVersion', payload);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
