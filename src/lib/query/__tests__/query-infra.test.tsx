/**
 * Phase 1 react-query 基础设施冒烟测试（p1-query-infra）：
 * - QueryClient 默认策略：staleTime 30s；重试分类（业务错误不重试、网络错误/5xx 重试）
 * - query key 工厂形状：['hc', domain, kind, ...params]
 * - 错误文案约定：toUserMessage / isAuthExpiredError
 * - fetchQuery 端到端：queryKeys.project.list + useProjectList 的 queryFn 走
 *   POST /project/v1/findByPage（mock api.post，不打真实后端）
 * - SSR 渲染冒烟：QueryClientProvider 下使用 useProjectList 的组件可渲染，
 *   服务端渲染时不发起请求、返回 pending 状态、不崩溃
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/query-infra.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, isRetryableQueryError } from '../client';
import { queryKeys } from '../keys';
import { isAuthExpiredError, toUserMessage } from '../error';
import { useProjectList } from '../hooks/useProjects';
import { api, ApiBusinessError, HttpResponseError } from '../../api/client';
import { projectApi } from '../../api/project';
import type { PageResult, ProjectResponse } from '../../api/types';

const businessError = (code: number, msg = '业务错误') =>
  new ApiBusinessError({ code, msg, result: null }, 200);

describe('createQueryClient 默认策略', () => {
  it('staleTime 30s，refetchOnWindowFocus 关闭', () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.mutations?.retry).toBe(false);
  });

  it('业务错误（含登录失效）不重试', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;
    expect(typeof retry).toBe('function');
    const fn = retry as (failureCount: number, error: unknown) => boolean;
    expect(fn(0, businessError(10109, '登录已过期'))).toBe(false);
    expect(fn(0, businessError(10001, '参数错误'))).toBe(false);
    // 非信封畸形响应的 400 也不重试
    expect(fn(0, new HttpResponseError('接口返回格式异常', 400))).toBe(false);
  });

  it('网络错误/超时可重试，最多 2 次', () => {
    const fn = createQueryClient().getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: unknown,
    ) => boolean;
    const networkError = new TypeError('fetch failed');
    expect(fn(0, networkError)).toBe(true);
    expect(fn(1, networkError)).toBe(true);
    expect(fn(2, networkError)).toBe(false);
    // 5xx 可重试
    expect(fn(0, new HttpResponseError('bad gateway', 502))).toBe(true);
  });
});

describe('isRetryableQueryError', () => {
  it('业务错误永不重试', () => {
    expect(isRetryableQueryError(businessError(10115))).toBe(false);
  });
  it('未知错误按可重试处理', () => {
    expect(isRetryableQueryError(new Error('boom'))).toBe(true);
  });
});

describe('queryKeys 工厂', () => {
  it("形状为 ['hc', domain, kind, ...params]", () => {
    const params = { page: 1, pageSize: 100, bean: {} };
    expect(queryKeys.project.list(params)).toEqual(['hc', 'project', 'list', params]);
    expect(queryKeys.project.detail(42)).toEqual(['hc', 'project', 'detail', 42]);
    expect(queryKeys.project.enums()).toEqual(['hc', 'project', 'enums']);
    expect(queryKeys.requirement.all).toEqual(['hc', 'requirement']);
    expect(queryKeys.task.all).toEqual(['hc', 'task']);
  });

  it('不同域的 key 互不冲突', () => {
    const p = queryKeys.project.list();
    const t = queryKeys.task.list();
    expect(p).not.toEqual(t);
    expect(p[1]).toBe('project');
    expect(t[1]).toBe('task');
  });
});

describe('错误文案约定', () => {
  it('业务错误直接用后端 msg', () => {
    expect(toUserMessage(businessError(10001, '项目标识已存在'))).toBe('项目标识已存在');
  });
  it('超时 Abort 给超时文案', () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    expect(toUserMessage(abort)).toBe('请求超时，请检查网络后重试');
  });
  it('5xx 给服务不可用文案', () => {
    expect(toUserMessage(new HttpResponseError('bad gateway', 502))).toContain('服务暂时不可用');
  });
  it('非 Error 值用兜底文案', () => {
    expect(toUserMessage('oops')).toBe('请求失败，请稍后重试');
    expect(toUserMessage(null, '自定义兜底')).toBe('自定义兜底');
  });
  it('登录失效类业务码识别（非连续区间，10110 不是）', () => {
    expect(isAuthExpiredError(businessError(10109))).toBe(true);
    expect(isAuthExpiredError(businessError(10115))).toBe(true);
    expect(isAuthExpiredError(businessError(10110))).toBe(false);
    expect(isAuthExpiredError(new Error('x'))).toBe(false);
  });
});

describe('useProjectList 数据链路（mock api.post）', () => {
  const pageResult: PageResult<ProjectResponse> = {
    list: [
      {
        id: 7,
        projectName: '冒烟项目',
        projectKey: 'SMOKE',
        description: null,
        projectType: 'agile',
        status: 'in_progress',
        startDate: null,
        endDate: null,
        projectManagerId: null,
        memberCount: 3,
        projectManagerName: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    total: 1,
    pageNumber: 1,
    pageSize: 100,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('走 POST /project/v1/findByPage，请求体为标准分页格式', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult);
    const client = createQueryClient();
    // 与 useProjectList 的 queryFn 同一路：queryKeys.project.list + projectApi.getProjectList
    const data = await client.fetchQuery({
      queryKey: queryKeys.project.list({ page: 1, pageSize: 100, bean: {} }),
      queryFn: () => projectApi.getProjectList(),
    });
    expect(data).toEqual(pageResult);
    expect(postSpy).toHaveBeenCalledWith('/project/v1/findByPage', {
      page: 1,
      pageSize: 100,
      bean: {},
    });
  });

  it('SSR 渲染冒烟：组件可渲染、服务端不发起请求、不崩溃', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult);
    function SmokeList() {
      const { isPending, data } = useProjectList();
      if (isPending) return <div>loading…</div>;
      return <div>projects: {data?.total}</div>;
    }
    const client = createQueryClient();
    const html = renderToString(
      <QueryClientProvider client={client}>
        <SmokeList />
      </QueryClientProvider>,
    );
    expect(html).toContain('loading');
    // 服务端渲染不触发 queryFn
    expect(postSpy).not.toHaveBeenCalled();
  });
});
