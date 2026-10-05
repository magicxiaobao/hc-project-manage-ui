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
 * （projectKey 全局唯一）。
 *
 * Codex review 4175265682：不能只看第一页——模糊命中的记录数超过一页时，
 * 精确记录可能落在后面。逐页翻页直到精确命中或分页耗尽。
 * Codex review 4175337068：不设硬性页数上限——按分页元数据
 *（返回条数不足一页，或累计已覆盖 total）判断耗尽，避免短键的精确
 * 记录落在第 11 页之后时被误判为“项目不存在”。
 * 无精确命中返回 null。
 */
export async function resolveProjectIdByKey(projectKey: string): Promise<number | null> {
  const key = (projectKey ?? '').trim();
  if (!key) return null;
  const pageSize = 100;
  for (let page = 1; ; page += 1) {
    const result = await projectApi.findByPage({
      page,
      pageSize,
      bean: { projectKey: key },
    });
    const exact = result.list.find((record) => record.projectKey === key);
    if (exact) return exact.id;
    // 分页耗尽：当前页已是最后一页（返回条数不足一页，或累计已覆盖 total）。
    const fetched = result.pageNumber * result.pageSize;
    if (result.list.length < result.pageSize || fetched >= result.total) break;
  }
  return null;
}

/** 上次成功解析的项目 id（r25-2 修复的纯逻辑，可独立测试）。 */
export interface LastGoodProject {
  key: string;
  id: number;
}

/**
 * r25-2：lastGood 更新规则——
 * - 解析返回数字 → 更新为 { key, id }；
 * - 解析成功但返回 null（项目不存在，权威结论）→ 若归属同一 key 则清除，
 *   之后同一 key 重取失败不再回退到旧项目 id；
 * - 其余（pending / 失败 / 其它）→ 保持原值。
 */
export function nextLastGoodProject(
  current: LastGoodProject | null,
  projectKey: string,
  resolution: { isPending: boolean; isError: boolean; data: number | null | undefined },
): LastGoodProject | null {
  if (typeof resolution.data === 'number') {
    return { key: projectKey, id: resolution.data };
  }
  if (!resolution.isPending && !resolution.isError && resolution.data == null) {
    return current?.key === projectKey ? null : current;
  }
  return current;
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
