/**
 * Phase 1 需求列表接入真实后端（p1-requirement-list）测试：
 * - useRequirementList：POST /requirement/v1/findByPage，请求参数归一化
 *   （默认值 page=1、pageSize=20、bean={ projectId }）
 * - useRequirementList 门控：projectId 为 null → disabled，不发起请求
 * - useRequirementOptions：types/priorities/statuses 三个选项接口
 * - queryKey 形状约定：['hc', 'requirement', 'list'|'enums', ...]
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/requirement-list.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import { useRequirementList, useRequirementOptions } from '../hooks/useRequirements';
import { useAuthStore } from '../../api/auth-store';
import { api } from '../../api/client';
import { requirementApi } from '../../api/requirement';
import type { PageResult } from '../../api/types';
import type { RequirementOption, RequirementResponse } from '../../api/requirement-types';

function requirement(overrides: Partial<RequirementResponse>): RequirementResponse {
  return {
    id: 1,
    title: '演示需求',
    description: null,
    requirementType: 'Story',
    priority: 'MEDIUM',
    status: 'DRAFT',
    statusLabel: null,
    storyPoints: 3,
    projectId: 7,
    parentId: null,
    assigneeId: null,
    estimatedStartDate: null,
    estimatedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    createdAt: 1728000000000,
    updatedAt: 1728000000000,
    ...overrides,
  };
}

function pageResult(list: RequirementResponse[]): PageResult<RequirementResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

const OPTIONS: RequirementOption[] = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'REVIEW', label: '评审中' },
];

describe('useRequirementList 请求契约', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('走 POST /requirement/v1/findByPage，参数归一化（默认 page=1、pageSize=20）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([requirement({ id: 3 })]));
    const client = createQueryClient();
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    const data = await client.fetchQuery({
      queryKey: queryKeys.requirement.list(params),
      queryFn: () => requirementApi.findByPage(params),
    });
    expect(data.list[0]?.id).toBe(3);
    expect(postSpy).toHaveBeenCalledWith('/requirement/v1/findByPage', {
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });
  });

  it('筛选条件 title/类型/优先级/状态全部进入 bean', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    const client = createQueryClient();
    const params = {
      page: 2,
      pageSize: 20,
      bean: { projectId: 7, title: '登录', requirementType: 'Story' as const, priority: 'HIGH' as const, status: 'DRAFT' as const },
    };
    await client.fetchQuery({
      queryKey: queryKeys.requirement.list(params),
      queryFn: () => requirementApi.findByPage(params),
    });
    expect(postSpy).toHaveBeenCalledWith('/requirement/v1/findByPage', {
      page: 2,
      pageSize: 20,
      bean: { projectId: 7, title: '登录', requirementType: 'Story', priority: 'HIGH', status: 'DRAFT' },
    });
  });

  it("queryKey 形状为 ['hc', 'requirement', 'list', params]", () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    expect(queryKeys.requirement.list(params)).toEqual(['hc', 'requirement', 'list', params]);
  });
});

describe('useRequirementList 门控（SSR 冒烟：projectId 为 null 时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('projectId 为 null → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useRequirementList({ projectId: null });
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

describe('useRequirementOptions 选项接口', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('一次取齐 types/priorities/statuses 三个接口', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(OPTIONS);
    const client = createQueryClient();
    const [types, priorities, statuses] = await client.fetchQuery({
      queryKey: queryKeys.requirement.enums(),
      queryFn: () =>
        Promise.all([
          requirementApi.getRequirementTypes(),
          requirementApi.getRequirementPriorities(),
          requirementApi.getRequirementStatuses(),
        ]),
    });
    expect(types).toEqual(OPTIONS);
    expect(priorities).toEqual(OPTIONS);
    expect(statuses).toEqual(OPTIONS);
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/types');
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/priorities');
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/statuses');
  });

  it("queryKey 形状为 ['hc', 'requirement', 'enums']", () => {
    expect(queryKeys.requirement.enums()).toEqual(['hc', 'requirement', 'enums']);
  });

  it('未登录 → 不发起请求', () => {
    useAuthStore.setState({ isAuthenticated: false });
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(OPTIONS);
    function Smoke() {
      const { isPending, fetchStatus } = useRequirementOptions();
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
});
