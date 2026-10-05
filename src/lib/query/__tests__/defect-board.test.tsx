/**
 * Phase 2 缺陷看板接入真实后端（p2-defect-board）测试：
 * - useDefectBoard：GET /defect/v1/board?projectId=（全量非分页），queryKey 形状
 *   ['hc', 'defect', 'board', projectId]，projectId 为 null 时 disabled
 * - useDefectStatistics：GET /defect/v1/statistics?projectId=，queryKey 形状
 *   ['hc', 'defect', 'statistics', projectId]，projectId 为 null 时 disabled
 * - 看板列渲染口径：defectsByStatus 的空状态键缺失（Partial），消费端 ?? []
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/defect-board.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import { useDefectBoard, useDefectStatistics } from '../hooks/useDefects';
import { api } from '../../api/client';
import { defectApi } from '../../api/defect';
import { resolveBoardDropTarget } from '../../defect-board';
import type {
  DefectBoardResponse,
  DefectResponse,
  DefectStatisticsResponse,
} from '../../api/defect-types';

function defect(overrides: Partial<DefectResponse>): DefectResponse {
  return {
    id: 1,
    title: '演示缺陷',
    description: null,
    defectType: '功能',
    severity: 'MAJOR',
    priority: 'HIGH',
    status: 'NEW',
    statusLabel: null,
    projectId: 7,
    reporterId: null,
    assigneeId: null,
    testerId: null,
    foundDate: null,
    estimatedFixDate: null,
    actualFixDate: null,
    closedDate: null,
    reproductionSteps: null,
    expectedResult: null,
    actualResult: null,
    environment: null,
    attachments: null,
    tags: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function boardResponse(): DefectBoardResponse {
  return {
    defectsByStatus: {
      NEW: [defect({ id: 301, status: 'NEW' })],
      // 空状态（CLOSED 等）键缺失：后端 groupingBy 只含出现过的状态
    },
    columns: [
      { id: 'status-NEW', name: '新建', status: 'NEW', color: '#faad14', count: 1 },
      { id: 'status-CLOSED', name: '已关闭', status: 'CLOSED', color: '#8c8c8c', count: 0 },
    ],
  };
}

function statisticsResponse(): DefectStatisticsResponse {
  return {
    totalDefects: 5,
    openDefects: 2,
    inProgressDefects: 1,
    testingDefects: 1,
    resolvedDefects: 1,
    closedDefects: 0,
    severityStats: { '主要': 3, '未知': 2 },
    priorityStats: { HIGH: 2, MEDIUM: 3, LOW: 0 },
    typeStats: { '功能': 5 },
  };
}

describe('useDefectBoard 看板数据接口', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("queryKey 形状为 ['hc', 'defect', 'board', projectId]", () => {
    expect(queryKeys.defect.board(7)).toEqual(['hc', 'defect', 'board', 7]);
    expect(queryKeys.defect.board(null)).toEqual(['hc', 'defect', 'board', null]);
  });

  it('走 GET /defect/v1/board?projectId=，projectId 拼查询参数', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(boardResponse());
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.defect.board(7),
      queryFn: () => defectApi.getDefectBoardData(7),
    });
    expect(getSpy).toHaveBeenCalledWith('/defect/v1/board?projectId=7');
    expect(data.columns).toHaveLength(2);
    // 空状态键缺失：消费端按 Partial 处理，CLOSED 列渲染为空
    expect(data.defectsByStatus.CLOSED).toBeUndefined();
    expect(data.defectsByStatus.NEW ?? []).toHaveLength(1);
  });

  it('projectId 为 null → 不发起请求（SSR 冒烟）', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(boardResponse());
    function Smoke() {
      const { isPending, fetchStatus } = useDefectBoard(null);
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

describe('useDefectStatistics 统计接口', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("queryKey 形状为 ['hc', 'defect', 'statistics', projectId]", () => {
    expect(queryKeys.defect.statistics(7)).toEqual(['hc', 'defect', 'statistics', 7]);
    expect(queryKeys.defect.statistics(null)).toEqual(['hc', 'defect', 'statistics', null]);
  });

  it('走 GET /defect/v1/statistics?projectId=，返回计数与三维分布', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(statisticsResponse());
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.defect.statistics(7),
      queryFn: () => defectApi.getDefectStatistics(7),
    });
    expect(getSpy).toHaveBeenCalledWith('/defect/v1/statistics?projectId=7');
    expect(data.totalDefects).toBe(5);
    expect(data.openDefects).toBe(2);
    expect(data.severityStats['主要']).toBe(3);
    expect(data.priorityStats.HIGH).toBe(2);
  });

  it('projectId 为 null → 不发起请求（SSR 冒烟）', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(statisticsResponse());
    function Smoke() {
      const { isPending, fetchStatus } = useDefectStatistics(null);
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

describe('projectId 门控收紧（Codex 本地评审 NOTE：0/负数/小数亦 disabled）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([0, -1, 1.5, Number.NaN])('useDefectBoard(%s) → 不发起请求', (projectId) => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(boardResponse());
    function Smoke() {
      const { fetchStatus } = useDefectBoard(projectId);
      return <div>{`fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('fetch:idle');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it.each([0, -3, 2.5])('useDefectStatistics(%s) → 不发起请求', (projectId) => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(statisticsResponse());
    function Smoke() {
      const { fetchStatus } = useDefectStatistics(projectId);
      return <div>{`fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('fetch:idle');
    expect(getSpy).not.toHaveBeenCalled();
  });
});

describe('resolveBoardDropTarget 拖放落点解析（Codex 本地评审 P2 回归）', () => {
  const statusOfCard = (cardId: number) =>
    ({ 11: 'NEW', 22: 'IN_PROGRESS' })[cardId] as 'NEW' | 'IN_PROGRESS' | undefined;

  it('列命中 → 该列状态（含空列）', () => {
    expect(resolveBoardDropTarget('column:VERIFIED', statusOfCard)).toBe('VERIFIED');
    expect(resolveBoardDropTarget('column:CLOSED', statusOfCard)).toBe('CLOSED');
  });

  it('卡片命中 → 该卡片当前状态', () => {
    expect(resolveBoardDropTarget('card:11', statusOfCard)).toBe('NEW');
    expect(resolveBoardDropTarget('card:22', statusOfCard)).toBe('IN_PROGRESS');
  });

  it('未知卡片 / 未知前缀 → null（无合法落点，不动作）', () => {
    expect(resolveBoardDropTarget('card:999', statusOfCard)).toBeNull();
    expect(resolveBoardDropTarget('', statusOfCard)).toBeNull();
    expect(resolveBoardDropTarget('other:x', statusOfCard)).toBeNull();
  });
});
