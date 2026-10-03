/**
 * Phase 1 需求追溯接入真实后端（p1-requirement-trace）测试：
 * - queryKey 工厂形状：trace / impact / matrix / children / hierarchy
 * - useRequirementTrace：数字 id → GET /requirement/v1/trace/{id}；null → disabled
 * - useRequirementImpact：数字 id → GET /requirement/v1/trace/{id}/impact；null → disabled
 * - useTraceMatrix：POST /requirement/v1/trace/matrix/findByPage，bean 默认带 projectId；
 *   projectId 为 null → disabled
 * - useRequirementChildren：数字 id → GET /requirement/v1/{id}/children
 * - useRequirementHierarchy：数字 projectId → GET /requirement/v1/hierarchy?projectId=；
 *   null → disabled
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/trace-hooks.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import {
  useRequirementChildren,
  useRequirementHierarchy,
  useRequirementImpact,
  useRequirementTrace,
  useTraceMatrix,
} from '../hooks/useRequirements';
import { api } from '../../api/client';
import { requirementApi } from '../../api/requirement';
import type { PageResult } from '../../api/types';
import type {
  RequirementImpact,
  RequirementMatrixQuery,
  RequirementMatrixRow,
  RequirementResponse,
  RequirementTrace,
} from '../../api/requirement-types';

function node(objectType: string, objectId: number) {
  return {
    objectType,
    objectId,
    displayName: `${objectType}#${objectId}`,
    status: null,
    assigneeId: null,
    runId: null,
    runType: null,
    direct: true,
    path: [],
  };
}

function bucket(total: number) {
  return { total, list: [], truncated: false };
}

function traceResponse(): RequirementTrace {
  return {
    requirement: node('REQUIREMENT', 7),
    tasks: bucket(2),
    testCases: bucket(0),
    testRuns: bucket(1),
    testExecutions: bucket(1),
    defects: bucket(0),
    versions: bucket(1),
    edges: [],
    generatedAt: '2026-10-04T00:00:00',
  };
}

function impactResponse(): RequirementImpact {
  return {
    root: node('REQUIREMENT', 7),
    nodes: [node('TASK', 21), node('DEFECT', 33)],
    edges: [
      { sourceObject: { objectType: 'REQUIREMENT', objectId: 7 }, relationType: 'IMPLEMENTED_BY', targetObject: { objectType: 'TASK', objectId: 21 }, direct: true },
    ],
    totalNodes: 2,
    truncated: false,
    generatedAt: '2026-10-04T00:00:00',
  };
}

function requirementResponse(overrides: Partial<RequirementResponse>): RequirementResponse {
  return {
    id: 1,
    title: '需求一',
    description: null,
    requirementType: 'Story',
    priority: 'HIGH',
    status: 'IN_DEVELOPMENT',
    statusLabel: null,
    storyPoints: null,
    projectId: 9,
    parentId: null,
    assigneeId: null,
    estimatedStartDate: null,
    estimatedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function matrixRow(id: number): RequirementMatrixRow {
  return {
    requirement: node('REQUIREMENT', id),
    taskSummaries: [],
    testCaseSummaries: [],
    defectSummaries: [],
    versionEvidence: { total: 0, truncated: false, items: [] },
  };
}

describe('追溯 queryKey 工厂形状', () => {
  it("trace/impact/children/hierarchy 的 key 形状", () => {
    expect(queryKeys.requirement.trace(7)).toEqual(['hc', 'requirement', 'trace', 7]);
    expect(queryKeys.requirement.impact(7)).toEqual(['hc', 'requirement', 'impact', 7]);
    expect(queryKeys.requirement.children(7)).toEqual(['hc', 'requirement', 'children', 7]);
    expect(queryKeys.requirement.hierarchy(9)).toEqual(['hc', 'requirement', 'hierarchy', 9]);
  });

  it('matrix 的 key 携带归一化参数对象', () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 9 } };
    expect(queryKeys.requirement.matrix(params)).toEqual(['hc', 'requirement', 'matrix', params]);
  });
});

describe('useRequirementTrace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('数字 id → GET /requirement/v1/trace/{id}', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(traceResponse());
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.requirement.trace(7),
      queryFn: () => requirementApi.getTrace(7),
    });
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/trace/7');
    expect(data.requirement.displayName).toBe('REQUIREMENT#7');
    expect(data.tasks.total).toBe(2);
  });

  it('id 为 null → disabled，不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(traceResponse());
    function Smoke() {
      const { isPending, fetchStatus } = useRequirementTrace(null);
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

describe('useRequirementImpact', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('数字 id → GET /requirement/v1/trace/{id}/impact', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(impactResponse());
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.requirement.impact(7),
      queryFn: () => requirementApi.getImpact(7),
    });
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/trace/7/impact');
    expect(data.totalNodes).toBe(2);
    expect(data.edges).toHaveLength(1);
  });

  it('id 为 0 → disabled，不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(impactResponse());
    function Smoke() {
      const { isPending, fetchStatus } = useRequirementImpact(0);
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

describe('useTraceMatrix', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST /requirement/v1/trace/matrix/findByPage，bean 默认带 projectId', async () => {
    const page: PageResult<RequirementMatrixRow> = { list: [matrixRow(7)], total: 1, pageNumber: 1, pageSize: 20 };
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(page);
    const client = createQueryClient();
    const bean: RequirementMatrixQuery = { projectId: 9, title: '登录' };
    const data = await client.fetchQuery({
      queryKey: queryKeys.requirement.matrix({ page: 1, pageSize: 20, bean }),
      queryFn: () => requirementApi.findMatrixByPage({ page: 1, pageSize: 20, bean }),
    });
    expect(postSpy).toHaveBeenCalledWith('/requirement/v1/trace/matrix/findByPage', {
      page: 1,
      pageSize: 20,
      bean: { projectId: 9, title: '登录' },
    });
    expect(data.total).toBe(1);
  });

  it('projectId 为 null → disabled，不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ list: [], total: 0, pageNumber: 1, pageSize: 20 });
    function Smoke() {
      const { isPending, fetchStatus } = useTraceMatrix({ projectId: null });
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

describe('useRequirementChildren / useRequirementHierarchy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('children：数字 id → GET /requirement/v1/{id}/children', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue([requirementResponse({ id: 8, parentId: 7 })]);
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.requirement.children(7),
      queryFn: () => requirementApi.getChildRequirements(7),
    });
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/7/children');
    expect(data).toHaveLength(1);
    expect(data[0].parentId).toBe(7);
  });

  it('hierarchy：数字 projectId → GET /requirement/v1/hierarchy?projectId=', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue([requirementResponse({ id: 7, projectId: 9 })]);
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.requirement.hierarchy(9),
      queryFn: () => requirementApi.getRequirementHierarchy(9),
    });
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/hierarchy?projectId=9');
    expect(data).toHaveLength(1);
  });

  it('hierarchy：projectId 为 null → disabled，不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue([]);
    function Smoke() {
      const { isPending, fetchStatus } = useRequirementHierarchy(null);
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
