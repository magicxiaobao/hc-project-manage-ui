/**
 * 缺陷域 react-query hooks（P2：p2-defect-list-create 垂直切片）。
 *
 * 约定（沿用 useRequirements.ts / useTasks.ts）：
 * - queryKey 一律走 queryKeys.defect.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （缺陷列表始终按项目过滤，bean.projectId 必传）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { defectApi } from '../../api/defect';
import type {
  DefectCreatePayload,
  DefectQueryRequest,
  DefectStatusOption,
} from '../../api/defect-types';
import { useAuthStore } from '../../api/auth-store';
import { queryKeys } from '../keys';

export interface DefectListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<DefectQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

export function normalizeListParams(params: DefectListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/** 缺陷列表（分页）：走 POST /defect/v1/findByPage；筛选=标题/状态/严重度/优先级 */
export function useDefectList(params: DefectListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeListParams(params);
  return useQuery({
    queryKey: queryKeys.defect.list(normalized),
    queryFn: () => defectApi.findByPage(normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/**
 * 缺陷状态选项（十态枚举元数据）：走 GET /defect/v1/statusOptions。
 * value=状态机枚举名，label=中文文案，供列表筛选、看板列、流转选择；
 * 登录态才可请求。
 */
export function useDefectStatusOptions() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return useQuery({
    queryKey: queryKeys.defect.enums(),
    queryFn: (): Promise<DefectStatusOption[]> => defectApi.getStatusOptions(),
    enabled: isAuthenticated,
  });
}

/**
 * 创建缺陷：走 POST /defect/v1/createDefect（后端返回新建缺陷 id）。
 * 成功后失效缺陷域全部缓存（列表变脏，下次读取即出现新缺陷）。
 * Codex review 4175337096（任务侧先例）：新建并关联需求后，需求追溯图/影响范围/矩阵
 * 要看到新缺陷，一并失效需求域；否则 30 秒 stale 窗口内追溯页展示旧图。
 */
export function useCreateDefect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DefectCreatePayload) => defectApi.createDefect(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.defect.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.requirement.all });
    },
  });
}
