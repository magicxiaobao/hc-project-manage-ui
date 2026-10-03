/**
 * 项目域 react-query hooks（P1 垂直切片的基础：p1-project-create / p1-project-detail-live 在此之上）。
 *
 * 约定：
 * - queryKey 一律走 queryKeys.project.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=100、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 详情 hook 的 id 为 null/undefined 时 disabled，不发起请求
 */
import { useQuery } from '@tanstack/react-query';
import { projectApi } from '../../api/project';
import type { ProjectQuery } from '../../api/types';
import { queryKeys } from '../keys';

export interface ProjectListParams {
  page?: number;
  pageSize?: number;
  bean?: ProjectQuery;
}

function normalizeListParams(params: ProjectListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 100,
    bean: params.bean ?? {},
  };
}

/** 项目列表（分页）：走 POST /project/v1/findByPage */
export function useProjectList(params: ProjectListParams = {}) {
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: queryKeys.project.list(normalized),
    queryFn: () => projectApi.getProjectList(normalized),
  });
}

/** 项目详情：走 GET /project/v1/findById/{id} */
export function useProjectDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.project.detail(id ?? 0),
    queryFn: () => projectApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id),
  });
}

/** 项目枚举（类型/状态/优先级选项）：走 GET /project/v1/enums */
export function useProjectEnums() {
  return useQuery({
    queryKey: queryKeys.project.enums(),
    queryFn: () => projectApi.getEnums(),
  });
}
