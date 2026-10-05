/**
 * 缺陷 API。契约忠实于 hc-project-manage 后端 DefectController（defect/v1）与
 * 老前端（frontend/src/api/defect.ts）：
 * - createDefect/updateDefect/updateStatus/{defectId}/severity/
 *   findByPage/advancedSearch 全部为 POST（后端语义：状态变更与“删除”类操作也用 POST）
 * - findById/statistics/board/statusOptions 为 GET
 * - findByPage 与 advancedSearch 的 projectId 在 bean 内传递（后端非管理员必需）
 * - statistics 与 board 的 projectId 为查询参数（可选，缺省时后端要求系统管理员）
 * - statusOptions 无需项目参数，返回十态枚举元数据，供筛选/看板列/流转选择
 * - 批量操作（batchUpdateStatus/batch）与 advancedSearchList 为 P2 明确排除项，不建模
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  DefectAdvancedQuery,
  DefectBoardResponse,
  DefectCreatePayload,
  DefectResponse,
  DefectSeverityChangePayload,
  DefectSeverityChangeResult,
  DefectStatisticsResponse,
  DefectStatusOption,
  DefectTransitionPayload,
  DefectUpdatePayload,
  DefectQueryRequest,
} from './defect-types';

export const defectApi = {
  /** 创建缺陷：后端返回新建缺陷 id */
  createDefect: (data: DefectCreatePayload) =>
    api.post<number>('/defect/v1/createDefect', data),

  /** 更新缺陷字段：严重度与状态流转不在此入口 */
  updateDefect: (data: DefectUpdatePayload) =>
    api.post<string>('/defect/v1/updateDefect', data),

  /**
   * 重新评定缺陷严重度：CAS 命令，需提供客户端已读取的旧值 expectedSeverity；
   * reason 去空白后需为 1～500 字符（后端约束），与老前端一致此处先裁去首尾空白。
   */
  changeSeverity: (defectId: number, data: DefectSeverityChangePayload) =>
    api.post<DefectSeverityChangeResult>(`/defect/v1/${defectId}/severity`, {
      ...data,
      reason: data.reason.trim(),
    }),

  /**
   * 变更缺陷状态：生命周期流转经后端状态机门面。
   * status 为 DefectStatus 枚举名；reason 落到 solution/closeReason/rejectReason/
   * reopenReason 等具体语义；ASSIGN 边需 assigneeId，IN_PROGRESS→TESTING 需 testerId，
   * →VERIFIED 需 verifierId，缺失后端 fail-fast。
   */
  updateStatus: (data: DefectTransitionPayload) =>
    api.post<string>('/defect/v1/updateStatus', data),

  /** 按 id 查询缺陷详情 */
  findById: (id: number) =>
    api.get<DefectResponse>(`/defect/v1/findById/${id}`),

  /** 分页查询缺陷：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<DefectQueryRequest>) =>
    api.post<PageResult<DefectResponse>>('/defect/v1/findByPage', params),

  /** 缺陷列表（垂直切片）：默认第 1 页、每页 100 条 */
  getDefectList: (params?: { page?: number; pageSize?: number; bean?: DefectQueryRequest }) =>
    defectApi.findByPage({
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 100,
      bean: params?.bean ?? {},
    }),

  /**
   * 缺陷统计（GET，projectId 为查询参数；缺省时后端要求系统管理员）。
   * 含总数/待处理/处理中/测试中/已解决/已关闭计数与严重度/优先级/类型分布。
   */
  getDefectStatistics: (projectId?: number) =>
    api.get<DefectStatisticsResponse>(
      projectId == null ? '/defect/v1/statistics' : `/defect/v1/statistics?projectId=${projectId}`,
    ),

  /**
   * 缺陷看板数据（GET，projectId 为查询参数；缺省时后端要求系统管理员）。
   * 返回按状态分组的缺陷（defectsByStatus）与看板列配置（columns）。
   */
  getDefectBoardData: (projectId?: number) =>
    api.get<DefectBoardResponse>(
      projectId == null ? '/defect/v1/board' : `/defect/v1/board?projectId=${projectId}`,
    ),

  /**
   * 缺陷状态选项（契约元数据）：value=状态机枚举名，label=中文文案，
   * 暴露全部十态，供前端构建筛选/看板列/流转选择，不在前端硬编码状态集合。
   */
  getStatusOptions: () =>
    api.get<DefectStatusOption[]>('/defect/v1/statusOptions'),

  /** 高级搜索（分页）：标准分页请求体 { page, pageSize, bean: DefectAdvancedQuery } */
  advancedSearch: (params: PageRequest<DefectAdvancedQuery>) =>
    api.post<PageResult<DefectResponse>>('/defect/v1/advancedSearch', params),
};
