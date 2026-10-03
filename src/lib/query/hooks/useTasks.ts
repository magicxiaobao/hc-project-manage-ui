/**
 * 任务域 react-query hooks（P1：p1-task-list 垂直切片）。
 *
 * 约定（沿用 useRequirements.ts）：
 * - queryKey 一律走 queryKeys.task.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （任务列表始终按项目过滤，p1-task-list 的 bean.projectId 必传）
 */
import { useQuery } from '@tanstack/react-query';
import { taskApi } from '../../api/task';
import type { TaskQueryRequest } from '../../api/task-types';
import { queryKeys } from '../keys';

export interface TaskListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<TaskQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

function normalizeListParams(params: TaskListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/** 任务列表（分页）：走 POST /task/v1/findByPage；筛选=标题/类型/优先级/状态/执行人 */
export function useTaskList(params: TaskListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: queryKeys.task.list(normalized),
    queryFn: () => taskApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}
