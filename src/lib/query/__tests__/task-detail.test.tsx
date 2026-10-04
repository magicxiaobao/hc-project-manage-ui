/**
 * Phase 1 任务详情接入真实后端（p1-task-detail）测试：
 * - taskTransitionTargets 纯函数：状态机拓扑
 *   （忠实于老前端 frontend/src/types/task.ts 的 TASK_TRANSITIONS_BY_STATUS，
 *   后端 TaskStatusEnum 状态机为唯一权威）
 * - taskNeedsReason/taskNeedsReopenReason/taskNeedsAssigneeConfirm/
 *   taskNeedsActorReason/taskTransitionLabel：流转表单字段要求与按钮文案
 * - API 契约：updateStatus 走 POST /task/v1/updateStatus；
 *   assign 走 POST /task/v1/assign（reason 必填）；
 *   createComment 走 POST /comment/v1/target/TASK/{id}/create（封闭合同，仅 content/parentId）；
 *   findComments 走 POST /comment/v1/target/TASK/{id}/find（封闭合同，仅 page/pageSize）
 * - queryKey 形状：['hc', 'task', 'detail'|'comments', ...]
 * - useTaskDetail/useTaskComments 门控：id 为 null → disabled，不发起请求
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/task-detail.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import {
  TASK_TRANSITIONS_BY_STATUS,
  taskNeedsActorReason,
  taskNeedsAssigneeConfirm,
  taskNeedsReason,
  taskNeedsReopenReason,
  taskTransitionLabel,
  taskTransitionTargets,
  useTaskComments,
  useTaskDetail,
} from '../hooks/useTasks';
import { api } from '../../api/client';
import { taskApi } from '../../api/task';
import type { PageResult } from '../../api/types';
import type { CommentView } from '../../api/requirement-types';
import type { TaskStatus } from '../../api/task-types';

function comment(overrides: Partial<CommentView> = {}): CommentView {
  return {
    id: 21,
    content: '已复现，着手修复',
    targetType: 'TASK',
    targetId: 9,
    parentId: null,
    creatorId: 4,
    createdAt: 1728000000,
    updatedAt: 1728000000,
    ...overrides,
  };
}

function commentPage(list: CommentView[]): PageResult<CommentView> {
  return { list, total: list.length, pageNumber: 1, pageSize: 50 };
}

describe('任务状态流转拓扑（taskTransitionTargets）', () => {
  it('与老前端 TASK_TRANSITIONS_BY_STATUS 一致', () => {
    expect(TASK_TRANSITIONS_BY_STATUS).toEqual({
      TODO: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
      PAUSED: ['IN_PROGRESS', 'CANCELLED'],
      COMPLETED: ['IN_PROGRESS'],
      CANCELLED: [],
    });
  });

  it('每种状态返回正确的可达目标', () => {
    const expectations: Record<TaskStatus, TaskStatus[]> = {
      TODO: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
      PAUSED: ['IN_PROGRESS', 'CANCELLED'],
      COMPLETED: ['IN_PROGRESS'],
      CANCELLED: [],
    };
    for (const [from, expected] of Object.entries(expectations)) {
      expect(taskTransitionTargets(from)).toEqual(expected);
    }
  });

  it('未知状态 / null → 空列表（不渲染流转按钮）', () => {
    expect(taskTransitionTargets('WHATEVER')).toEqual([]);
    expect(taskTransitionTargets(null)).toEqual([]);
    expect(taskTransitionTargets(undefined)).toEqual([]);
  });
});

describe('流转字段要求与按钮文案', () => {
  it('taskNeedsReason：PAUSED/CANCELLED/COMPLETED 需原因，其它不需要', () => {
    for (const to of ['PAUSED', 'CANCELLED', 'COMPLETED']) {
      expect(taskNeedsReason(to)).toBe(true);
    }
    for (const to of ['TODO', 'IN_PROGRESS']) {
      expect(taskNeedsReason(to)).toBe(false);
    }
  });

  it('taskNeedsReopenReason：仅 COMPLETED → IN_PROGRESS', () => {
    expect(taskNeedsReopenReason('COMPLETED', 'IN_PROGRESS')).toBe(true);
    expect(taskNeedsReopenReason('PAUSED', 'IN_PROGRESS')).toBe(false);
    expect(taskNeedsReopenReason('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('taskNeedsAssigneeConfirm：仅 TODO → IN_PROGRESS 且无执行人', () => {
    expect(taskNeedsAssigneeConfirm('TODO', 'IN_PROGRESS', null)).toBe(true);
    expect(taskNeedsAssigneeConfirm('TODO', 'IN_PROGRESS', undefined)).toBe(true);
    expect(taskNeedsAssigneeConfirm('TODO', 'IN_PROGRESS', 5)).toBe(false);
    expect(taskNeedsAssigneeConfirm('PAUSED', 'IN_PROGRESS', null)).toBe(false);
    expect(taskNeedsAssigneeConfirm('TODO', 'CANCELLED', null)).toBe(false);
  });

  it('taskNeedsActorReason：非执行人本人开始任务需原因', () => {
    expect(taskNeedsActorReason('IN_PROGRESS', 5, 7)).toBe(true);
    expect(taskNeedsActorReason('IN_PROGRESS', 5, 5)).toBe(false);
    expect(taskNeedsActorReason('IN_PROGRESS', null, 7)).toBe(false);
    expect(taskNeedsActorReason('IN_PROGRESS', 5, null)).toBe(false);
    expect(taskNeedsActorReason('PAUSED', 5, 7)).toBe(false);
  });

  it('taskTransitionLabel：开始/恢复/重新打开/暂停/完成/取消', () => {
    const fallback = (status: string) => `标签:${status}`;
    expect(taskTransitionLabel('TODO', 'IN_PROGRESS', fallback)).toBe('开始');
    expect(taskTransitionLabel('PAUSED', 'IN_PROGRESS', fallback)).toBe('恢复');
    expect(taskTransitionLabel('COMPLETED', 'IN_PROGRESS', fallback)).toBe('重新打开');
    expect(taskTransitionLabel('IN_PROGRESS', 'PAUSED', fallback)).toBe('暂停');
    expect(taskTransitionLabel('IN_PROGRESS', 'COMPLETED', fallback)).toBe('完成');
    expect(taskTransitionLabel('IN_PROGRESS', 'CANCELLED', fallback)).toBe('取消');
  });
});

describe('任务状态流转/改派 API 契约', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updateTaskStatus 走 POST /task/v1/updateStatus，载荷按 { taskId, status, context } 展开', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    const result = await taskApi.updateTaskStatus(9, 'IN_PROGRESS', {
      reason: '开始着手',
      assigneeId: 4,
    });
    expect(result).toBe('ok');
    expect(postSpy).toHaveBeenCalledWith('/task/v1/updateStatus', {
      taskId: 9,
      status: 'IN_PROGRESS',
      reason: '开始着手',
      assigneeId: 4,
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('updateTaskStatus 完成时可带 deliverables', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await taskApi.updateTaskStatus(9, 'COMPLETED', {
      reason: '修复完成',
      deliverables: '修复分支 + 回归测试报告',
    });
    expect(postSpy).toHaveBeenCalledWith('/task/v1/updateStatus', {
      taskId: 9,
      status: 'COMPLETED',
      reason: '修复完成',
      deliverables: '修复分支 + 回归测试报告',
    });
  });

  it('assignTask 走 POST /task/v1/assign，载荷原样透传', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    const result = await taskApi.assignTask({ taskId: 9, assigneeId: 6, reason: '原执行人休假' });
    expect(result).toBe('ok');
    expect(postSpy).toHaveBeenCalledWith('/task/v1/assign', {
      taskId: 9,
      assigneeId: 6,
      reason: '原执行人休假',
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });
});

describe('任务评论 API 契约（comment/v1 线程，targetType=TASK）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createComment 走 POST /comment/v1/target/TASK/{id}/create，请求体仅 content/parentId', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(21);
    const id = await taskApi.createComment(9, { content: '已复现，着手修复', parentId: null });
    expect(id).toBe(21);
    expect(postSpy).toHaveBeenCalledWith('/comment/v1/target/TASK/9/create', {
      content: '已复现，着手修复',
      parentId: null,
    });
  });

  it('createComment 回复时透传 parentId', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(22);
    await taskApi.createComment(9, { content: '收到', parentId: 21 });
    expect(postSpy).toHaveBeenCalledWith('/comment/v1/target/TASK/9/create', {
      content: '收到',
      parentId: 21,
    });
  });

  it('findComments 走 POST /comment/v1/target/TASK/{id}/find，请求体仅 page/pageSize', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(commentPage([comment()]));
    const page = await taskApi.findComments(9, { page: 1, pageSize: 50 });
    expect(page.list[0]?.content).toBe('已复现，着手修复');
    expect(postSpy).toHaveBeenCalledWith('/comment/v1/target/TASK/9/find', {
      page: 1,
      pageSize: 50,
    });
  });
});

describe('任务详情 queryKey 形状约定', () => {
  it("detail 形状为 ['hc', 'task', 'detail', id]", () => {
    expect(queryKeys.task.detail(9)).toEqual(['hc', 'task', 'detail', 9]);
  });

  it("comments 形状为 ['hc', 'task', 'comments', id, params]", () => {
    const params = { page: 1, pageSize: 50 };
    expect(queryKeys.task.comments(9, params)).toEqual(['hc', 'task', 'comments', 9, params]);
  });
});

describe('任务详情 hooks 门控（SSR 冒烟：id 无效时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('useTaskDetail(null) → 不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(null);
    function Smoke() {
      const { isPending, fetchStatus } = useTaskDetail(null);
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

  it('useTaskDetail(0) → 不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(null);
    function Smoke() {
      const { fetchStatus } = useTaskDetail(0);
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

  it('useTaskComments(id 为 null) → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(commentPage([]));
    function Smoke() {
      const { fetchStatus } = useTaskComments(null);
      return <div>{`fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('fetch:idle');
    expect(postSpy).not.toHaveBeenCalled();
  });
});
