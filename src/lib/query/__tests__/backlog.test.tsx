/**
 * P3 Backlog 未规划任务池与 Sprint 规划（p3-backlog）测试：
 * - fetchAllProjectTasks：POST /task/v1/findByPage 分页循环（pageSize=500，
 *   bean 仅含 projectId，不下发 sprintId 过滤——后端无法表达 sprint_id IS NULL）
 * - filterBacklogTasks：sprintId == null 前端过滤口径
 * - useUpdateTaskSprint：POST /task/v1/updateTask 载荷仅 { id, sprintId }
 *   （后端 @JsonAnySetter 拒绝未知字段；显式 null = 移回待办）
 * - fetchAllProjectSprints：POST /sprint/v1/project/{projectId}/findByPage 分页循环
 * - filterMountableSprints / sortMountableSprints：仅 PLANNING/ACTIVE，
 *   ACTIVE 在前、同状态按 id 升序
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/backlog.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { taskApi } from '../../api/task';
import type { PageResult } from '../../api/types';
import type { TaskResponse } from '../../api/task-types';
import type { SprintResponse } from '../../api/sprint-types';
import {
  fetchAllProjectTasks,
  filterBacklogTasks,
} from '../hooks/useTasks';
import {
  fetchAllProjectSprints,
  filterMountableSprints,
  sortMountableSprints,
} from '../hooks/useSprints';

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

function sprint(overrides: Partial<SprintResponse>): SprintResponse {
  return {
    id: 10,
    sprintName: '冲刺 1',
    status: 'PLANNING',
    statusLabel: null,
    projectId: 7,
    createdAt: 1728000000000,
    updatedAt: 1728000000000,
    ...overrides,
  };
}

function pageResult<T>(list: T[], total?: number): PageResult<T> {
  return { list, total: total ?? list.length, pageNumber: 1, pageSize: 20 };
}

describe('fetchAllProjectTasks 分页循环', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bean 仅含 projectId（不下发 sprintId 过滤），按 pageSize=500 拉取', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([task({ id: 3 })]));
    const all = await fetchAllProjectTasks(7);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(3);
    expect(postSpy).toHaveBeenCalledWith('/task/v1/findByPage', {
      page: 1,
      pageSize: 500,
      bean: { projectId: 7 },
    });
    // bean 里绝不能出现 sprintId 键：后端 sprintId=null 等价于不过滤，
    // 下发它会误导"服务端已过滤"的假象
    const sentBean = (postSpy.mock.calls[0]?.[1] as { bean: Record<string, unknown> }).bean;
    expect('sprintId' in sentBean).toBe(false);
  });

  it('满页（500 条）时续拉下一页，不足一页即停', async () => {
    const first = Array.from({ length: 500 }, (_, i) => task({ id: i + 1 }));
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(pageResult(first, 501))
      .mockResolvedValueOnce(pageResult([task({ id: 501 })], 501));
    const all = await fetchAllProjectTasks(7);
    expect(all).toHaveLength(501);
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(postSpy).toHaveBeenNthCalledWith(2, '/task/v1/findByPage', {
      page: 2,
      pageSize: 500,
      bean: { projectId: 7 },
    });
  });
});

describe('filterBacklogTasks 前端过滤口径', () => {
  it('只保留 sprintId == null 的任务（null/undefined 均视为未规划）', () => {
    const tasks = [
      task({ id: 1, sprintId: null }),
      task({ id: 2, sprintId: 10 }),
      task({ id: 3, sprintId: undefined }),
      task({ id: 4, sprintId: 0 }),
    ];
    const backlog = filterBacklogTasks(tasks);
    expect(backlog.map((t) => t.id)).toEqual([1, 3]);
  });
});

describe('useUpdateTaskSprint 写操作契约', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('规划：POST /task/v1/updateTask，载荷仅 { id, sprintId }', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await taskApi.updateTask({ id: 42, sprintId: 10 });
    expect(postSpy).toHaveBeenCalledWith('/task/v1/updateTask', { id: 42, sprintId: 10 });
    // 后端 @JsonAnySetter 拒绝未知字段：载荷绝不能混入其它键
    const sent = postSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['id', 'sprintId']);
  });

  it('移回待办：sprintId 显式 null（后端"清空表示移回待办"）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await taskApi.updateTask({ id: 42, sprintId: null });
    expect(postSpy).toHaveBeenCalledWith('/task/v1/updateTask', { id: 42, sprintId: null });
  });
});

describe('fetchAllProjectSprints 分页循环', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('走 POST /sprint/v1/project/{projectId}/findByPage，bean 仅 projectId', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([sprint({ id: 11 })]));
    const all = await fetchAllProjectSprints(7);
    expect(all).toHaveLength(1);
    expect(postSpy).toHaveBeenCalledWith('/sprint/v1/project/7/findByPage', {
      page: 1,
      pageSize: 200,
      bean: { projectId: 7 },
    });
  });
});

describe('filterMountableSprints / sortMountableSprints', () => {
  it('只保留 PLANNING/ACTIVE（后端只允许挂载到这两种状态）', () => {
    const sprints = [
      sprint({ id: 1, status: 'PLANNING' }),
      sprint({ id: 2, status: 'COMPLETED' }),
      sprint({ id: 3, status: 'ACTIVE' }),
      sprint({ id: 4, status: 'CANCELLED' }),
    ];
    expect(filterMountableSprints(sprints).map((s) => s.id)).toEqual([1, 3]);
  });

  it('排序：ACTIVE 在前，其次 PLANNING，同状态按 id 升序', () => {
    const sprints = [
      sprint({ id: 5, status: 'PLANNING' }),
      sprint({ id: 2, status: 'ACTIVE' }),
      sprint({ id: 1, status: 'PLANNING' }),
      sprint({ id: 9, status: 'ACTIVE' }),
    ];
    expect(sortMountableSprints(sprints).map((s) => s.id)).toEqual([2, 9, 1, 5]);
  });
});
