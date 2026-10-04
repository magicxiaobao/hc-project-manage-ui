/**
 * Phase 1 项目详情接入真实后端（p1-project-detail-live）测试：
 * - resolveProjectIdByKey：projectKey（字符串）→ id（数字）解析策略
 *   - 走 POST /project/v1/findByPage，bean.projectKey 预过滤
 *   - 后端 like 模糊匹配 → 前端精确相等筛选（projectKey 全局唯一）
 *   - 无精确命中 → null
 * - useProjectIdByKey 门控：未登录 / key 为空 → disabled，不发起请求
 * - useProjectDetail：id 为 null → disabled；数字 id → GET /project/v1/findById/{id}
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/project-detail.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import { resolveProjectIdByKey, useProjectDetail, useProjectIdByKey } from '../hooks/useProjects';
import { useAuthStore } from '../../api/auth-store';
import { api } from '../../api/client';
import { projectApi } from '../../api/project';
import type { PageResult, ProjectResponse } from '../../api/types';

function project(overrides: Partial<ProjectResponse>): ProjectResponse {
  return {
    id: 1,
    projectName: '演示项目',
    projectKey: 'ACME',
    description: null,
    projectType: 'agile',
    status: 'in_progress',
    startDate: null,
    endDate: null,
    projectManagerId: null,
    memberCount: 0,
    projectManagerName: null,
    createdAt: 1728000000000,
    updatedAt: 1728000000000,
    ...overrides,
  };
}

function pageResult(list: ProjectResponse[]): PageResult<ProjectResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

describe('resolveProjectIdByKey 解析策略', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('走 POST /project/v1/findByPage，bean.projectKey 预过滤', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([project({ id: 7 })]));
    const client = createQueryClient();
    const id = await client.fetchQuery({
      queryKey: queryKeys.project.byKey('ACME'),
      queryFn: () => resolveProjectIdByKey('ACME'),
    });
    expect(id).toBe(7);
    expect(postSpy).toHaveBeenCalledWith('/project/v1/findByPage', {
      page: 1,
      pageSize: 100,
      bean: { projectKey: 'ACME' },
    });
  });

  it('后端模糊命中多条时只取精确相等的 projectKey', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(
      pageResult([
        project({ id: 2, projectKey: 'ACME-2' }),
        project({ id: 9, projectKey: 'XACME' }),
        project({ id: 5, projectKey: 'ACME' }),
      ]),
    );
    const client = createQueryClient();
    const id = await client.fetchQuery({
      queryKey: queryKeys.project.byKey('ACME'),
      queryFn: () => resolveProjectIdByKey('ACME'),
    });
    expect(id).toBe(5);
  });

  it('无精确命中 → null（调用方展示“项目不存在”）', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(
      pageResult([project({ id: 2, projectKey: 'ACME-2' })]),
    );
    const client = createQueryClient();
    const id = await client.fetchQuery({
      queryKey: queryKeys.project.byKey('NOPE'),
      queryFn: () => resolveProjectIdByKey('NOPE'),
    });
    expect(id).toBeNull();
  });

  it('Codex 4175265682：精确记录落在第二页时继续翻页，直到命中', async () => {
    const fuzzy = Array.from({ length: 100 }, (_, i) =>
      project({ id: 1000 + i, projectKey: `XACME-${i}` }),
    );
    const postSpy = vi
      .spyOn(api, 'post')
      .mockImplementation(async (_url: string, body?: unknown) => {
        const params = body as { page: number };
        if (params.page === 1) {
          return { list: fuzzy, total: 150, pageNumber: 1, pageSize: 100 };
        }
        return {
          list: [...fuzzy.slice(0, 50), project({ id: 7, projectKey: 'ACME' })],
          total: 150,
          pageNumber: 2,
          pageSize: 100,
        };
      });
    const client = createQueryClient();
    const id = await client.fetchQuery({
      queryKey: queryKeys.project.byKey('ACME'),
      queryFn: () => resolveProjectIdByKey('ACME'),
    });
    expect(id).toBe(7);
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(postSpy).toHaveBeenNthCalledWith(2, '/project/v1/findByPage', {
      page: 2,
      pageSize: 100,
      bean: { projectKey: 'ACME' },
    });
  });

  it('Codex 4175265682：所有页翻完仍无精确命中 → null', async () => {
    const fuzzy = Array.from({ length: 100 }, (_, i) =>
      project({ id: 1000 + i, projectKey: `XACME-${i}` }),
    );
    const postSpy = vi
      .spyOn(api, 'post')
      .mockImplementation(async (_url: string, body?: unknown) => {
        const params = body as { page: number };
        return {
          list: params.page === 1 ? fuzzy : fuzzy.slice(0, 50),
          total: 150,
          pageNumber: params.page,
          pageSize: 100,
        };
      });
    const client = createQueryClient();
    const id = await client.fetchQuery({
      queryKey: queryKeys.project.byKey('NOPE-KEY'),
      queryFn: () => resolveProjectIdByKey('NOPE-KEY'),
    });
    expect(id).toBeNull();
    expect(postSpy).toHaveBeenCalledTimes(2);
  });

  it('queryKey 形状为 [hc, project, byKey, key]', () => {
    expect(queryKeys.project.byKey('ACME')).toEqual(['hc', 'project', 'byKey', 'ACME']);
  });
});

describe('useProjectIdByKey 门控（SSR 冒烟：disabled 时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('未登录 → 不发起请求', () => {
    useAuthStore.setState({ isAuthenticated: false });
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useProjectIdByKey('ACME');
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

  it('key 为空 → 不发起请求', () => {
    useAuthStore.setState({ isAuthenticated: true });
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useProjectIdByKey('   ');
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

describe('useProjectDetail 详情链路', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('id 为 null → disabled，不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(project({ id: 7 }));
    function Smoke() {
      const { isPending, fetchStatus } = useProjectDetail(null);
      return <div>{`pending:${String(isPending)} fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('pending:true');
    expect(html).toContain('fetch:idle');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('数字 id → 走 GET /project/v1/findById/{id}', async () => {
    const detail = project({ id: 7, projectName: '真实项目' });
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(detail);
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.project.detail(7),
      queryFn: () => projectApi.findById(7),
    });
    expect(data).toEqual(detail);
    expect(getSpy).toHaveBeenCalledWith('/project/v1/findById/7');
  });
});
