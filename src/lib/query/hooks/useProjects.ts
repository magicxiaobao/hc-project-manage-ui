/**
 * 项目域 react-query hooks（P1 垂直切片的基础：p1-project-create / p1-project-detail-live 在此之上）。
 *
 * 约定：
 * - queryKey 一律走 queryKeys.project.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=100、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 详情 hook 的 id 为 null/undefined 时 disabled，不发起请求
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectApi } from '../../api/project';
import { useAuthStore } from '../../api/auth-store';
import type { ProjectCreatePayload, ProjectQuery } from '../../api/types';
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

/**
 * 按项目 key（路由里的 projectKey 字符串）解析后端项目 id（数字）。
 *
 * 解析策略（p1-project-detail-live）：
 * 1. POST /project/v1/findByPage，bean.projectKey 传路由 key 做服务端预过滤；
 * 2. 后端对 projectKey 是 like 模糊匹配（ProjectServiceImpl.findByPage），
 *    前端再做一次精确相等筛选（projectKey 全局唯一），命中即取其 id；
 * 3. 无精确命中 → 返回 null（调用方展示“项目不存在”）；
 * 4. 未登录或 key 为空 → disabled，不发起请求。
 *
 * 返回值语义：data === undefined 加载中；null 未找到；number 解析成功。
 */
/**
 * 按项目 key 精确解析项目 id 的内部逻辑（可独立测试）。
 *
 * 后端 findByPage 对 projectKey 是 like 模糊匹配（ProjectServiceImpl.findByPage），
 * 这里传 bean.projectKey 做服务端预过滤后，再在前端做精确相等筛选
 * （projectKey 全局唯一）。无精确命中返回 null。
 */
export async function resolveProjectIdByKey(projectKey: string): Promise<number | null> {
  const key = (projectKey ?? '').trim();
  const page = await projectApi.findByPage({
    page: 1,
    pageSize: 20,
    bean: { projectKey: key },
  });
  const exact = page.list.find((record) => record.projectKey === key);
  return exact ? exact.id : null;
}

export function useProjectIdByKey(projectKey: string) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const key = (projectKey ?? '').trim();
  return useQuery({
    queryKey: queryKeys.project.byKey(key),
    queryFn: () => resolveProjectIdByKey(key),
    enabled: isAuthenticated && key.length > 0,
  });
}

/** 项目枚举（类型/状态/优先级选项）：走 GET /project/v1/enums */
export function useProjectEnums() {
  return useQuery({
    queryKey: queryKeys.project.enums(),
    queryFn: () => projectApi.getEnums(),
  });
}

/**
 * 创建项目：走 POST /project/v1/createProject。
 * 成功后失效项目域全部缓存，/projects 列表自动刷新。
 */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectCreatePayload) => projectApi.createProject(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.project.all });
    },
  });
}
