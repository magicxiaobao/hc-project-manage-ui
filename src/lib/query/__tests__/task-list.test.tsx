/**
 * Phase 1 任务列表接入真实后端（p1-task-list）测试：
 * - useTaskList：POST /task/v1/findByPage，请求参数归一化
 *   （默认值 page=1、pageSize=20、bean={ projectId }）
 * - useTaskList 门控：projectId 为 null → disabled，不发起请求
 * - queryKey 形状约定：['hc', 'task', 'list', params]
 * - 选项常量：TASK_PRIORITIES/TASK_STATUSES 与后端 JSON identity 一致
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/task-list.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import { useTaskList } from '../hooks/useTasks';
import { api } from '../../api/client';
import { taskApi } from '../../api/task';
import { TASK_PRIORITIES, TASK_STATUSES } from '../../api/task-types';
import type { PageResult } from '../../api/types';
import type { TaskResponse } from '../../api/task-types';

function task(overrides: Partial<TaskResponse>): TaskResponse {
  return {
    id: 1,
    title: '演示任务',
    description: null,
    taskType: '开发',
    priority: 'MEDIUM',
    status: 'TODO',
    statusLabel: null,
    storyPoints: 3,
    projectId: 7,
    sprintId: null,
    assigneeId: null,
    reporterId: null,
    estimatedStartDate: null,
    estimatedEndDate: null,
    actualStartDate: null,
    actualEndDate: null,
    estimatedHours: null,
    actualHours: null,
    progress: null,
    tags: null,
    createdAt: 1728000000000,
    updatedAt: 1728000000000,
    ...overrides,
  };
}

function pageResult(list: TaskResponse[]): PageResult<TaskResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

describe('useTaskList 请求契约', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('走 POST /task/v1/findByPage，参数归一化（默认 page=1、pageSize=20）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([task({ id: 3 })]));
    const client = createQueryClient();
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    const data = await client.fetchQuery({
      queryKey: queryKeys.task.list(params),
      queryFn: () => taskApi.findByPage(params),
    });
    expect(data.list[0]?.id).toBe(3);
    expect(postSpy).toHaveBeenCalledWith('/task/v1/findByPage', {
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });
  });

  it('筛选条件 title/类型/优先级/状态/执行人全部进入 bean', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    const client = createQueryClient();
    const params = {
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, title: '登录', taskType: '开发', priority: 'HIGH' as const, status: 'TODO' as const, assigneeId: 42 },
    };
    await client.fetchQuery({
      queryKey: queryKeys.task.list(params),
      queryFn: () => taskApi.findByPage(params),
    });
    expect(postSpy).toHaveBeenCalledWith('/task/v1/findByPage', {
      page: 1,
      pageSize: 20,
      bean: { projectId: 7, title: '登录', taskType: '开发', priority: 'HIGH', status: 'TODO', assigneeId: 42 },
    });
  });

  it("queryKey 形状为 ['hc', 'task', 'list', params]", () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    expect(queryKeys.task.list(params)).toEqual(['hc', 'task', 'list', params]);
  });

  it('选项常量与后端枚举 JSON identity 一致', () => {
    expect(TASK_PRIORITIES).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    expect(TASK_STATUSES).toEqual(['TODO', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED']);
  });
});

describe('useTaskList 门控（SSR 冒烟：projectId 为 null 时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('projectId 为 null → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useTaskList({ projectId: null });
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
