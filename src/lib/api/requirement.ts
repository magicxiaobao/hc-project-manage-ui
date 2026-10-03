/**
 * 需求 API。契约忠实于 hc-project-manage 后端：
 * - RequirementController（requirement/v1）：createRequirement/updateRequirement/
 *   valid/{id}/invalid/{id}/findById/{id}/findByPage/{id}/children/hierarchy/types/priorities/statuses
 * - RequirementStatusTransitionController（requirement/v1/status）：transition/validate/
 *   allowed/{requirementId}/{currentStatus}/history/{requirementId}
 * - RequirementTraceController（requirement/v1/trace）：{id}/impact/matrix/findByPage/
 *   {id}/history/findByPage
 * - CommentController（comment/v1）：target/{targetType}/{targetId}/create|find、
 *   findById/{id}、updateComment、invalid/{id}（需求评论的 targetType = REQUIREMENT）
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  CommentCreatePayload,
  CommentUpdatePayload,
  CommentView,
  RequirementCreatePayload,
  RequirementImpact,
  RequirementMatrixQuery,
  RequirementMatrixRow,
  RequirementOption,
  RequirementQueryRequest,
  RequirementResponse,
  RequirementTrace,
  RequirementTransitionHistory,
  RequirementTransitionPayload,
  RequirementUpdatePayload,
  TraceHistoryEvent,
  TraceHistoryQuery,
} from './requirement-types';

export const requirementApi = {
  /** 创建需求：后端返回新建需求 id */
  createRequirement: (data: RequirementCreatePayload) =>
    api.post<number>('/requirement/v1/createRequirement', data),

  /** 更新需求 */
  updateRequirement: (data: RequirementUpdatePayload) =>
    api.post<string>('/requirement/v1/updateRequirement', data),

  /** 启用需求（只动 validStatus，不改生命周期 status） */
  validRequirement: (id: number) =>
    api.post<string>(`/requirement/v1/valid/${id}`),

  /** 禁用需求（只动 validStatus，不改生命周期 status） */
  invalidRequirement: (id: number) =>
    api.post<string>(`/requirement/v1/invalid/${id}`),

  /** 按 id 查询需求 */
  findById: (id: number) =>
    api.get<RequirementResponse>(`/requirement/v1/findById/${id}`),

  /** 分页查询需求：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<RequirementQueryRequest>) =>
    api.post<PageResult<RequirementResponse>>('/requirement/v1/findByPage', params),

  /** 需求列表（垂直切片）：默认第 1 页、每页 100 条 */
  getRequirementList: (params?: { page?: number; pageSize?: number; bean?: RequirementQueryRequest }) =>
    requirementApi.findByPage({
      page: params?.page ?? 1,
      pageSize: params?.pageSize ?? 100,
      bean: params?.bean ?? {},
    }),

  /** 子需求列表 */
  getChildRequirements: (requirementId: number) =>
    api.get<RequirementResponse[]>(`/requirement/v1/${requirementId}/children`),

  /** 需求层级树（可选按项目过滤） */
  getRequirementHierarchy: (projectId?: number) =>
    api.get<RequirementResponse[]>(
      projectId == null ? '/requirement/v1/hierarchy' : `/requirement/v1/hierarchy?projectId=${projectId}`,
    ),

  /** 需求类型选项 */
  getRequirementTypes: () =>
    api.get<RequirementOption[]>('/requirement/v1/types'),

  /** 需求优先级选项 */
  getRequirementPriorities: () =>
    api.get<RequirementOption[]>('/requirement/v1/priorities'),

  /** 需求状态选项（状态机枚举名 + 中文标签） */
  getRequirementStatuses: () =>
    api.get<RequirementOption[]>('/requirement/v1/statuses'),

  /** 执行状态流转（经后端状态机权威） */
  executeStatusTransition: (data: RequirementTransitionPayload) =>
    api.post<string>('/requirement/v1/status/transition', data),

  /** 验证状态流转是否允许 */
  validateStatusTransition: (requirementId: number, toStatus: string) =>
    api.post<boolean>('/requirement/v1/status/validate', { requirementId, toStatus }),

  /** 获取允许的状态流转（currentStatus 仅占位路由参数，后端按 requirementId 权威计算） */
  getAllowedTransitions: (requirementId: number, currentStatus: string) =>
    api.get<string[]>(`/requirement/v1/status/allowed/${requirementId}/${currentStatus}`),

  /** 状态流转历史（含当前状态与允许流转） */
  getTransitionHistory: (requirementId: number) =>
    api.get<RequirementTransitionHistory>(`/requirement/v1/status/history/${requirementId}`),

  /** 需求追溯图 */
  getTrace: (requirementId: number) =>
    api.get<RequirementTrace>(`/requirement/v1/trace/${requirementId}`),

  /** 需求影响范围 */
  getImpact: (requirementId: number) =>
    api.get<RequirementImpact>(`/requirement/v1/trace/${requirementId}/impact`),

  /** 追溯矩阵分页查询 */
  findMatrixByPage: (params: PageRequest<RequirementMatrixQuery>) =>
    api.post<PageResult<RequirementMatrixRow>>('/requirement/v1/trace/matrix/findByPage', params),

  /** 需求追溯历史分页查询 */
  findTraceHistoryByPage: (requirementId: number, params: PageRequest<TraceHistoryQuery>) =>
    api.post<PageResult<TraceHistoryEvent>>(`/requirement/v1/trace/${requirementId}/history/findByPage`, params),

  /** 在需求上创建评论（或回复：传 parentId） */
  createComment: (requirementId: number, data: CommentCreatePayload) =>
    api.post<number>(`/comment/v1/target/REQUIREMENT/${requirementId}/create`, data),

  /** 分页读取需求评论 */
  findComments: (requirementId: number, params: { page: number; pageSize: number }) =>
    api.post<PageResult<CommentView>>(`/comment/v1/target/REQUIREMENT/${requirementId}/find`, params),

  /** 按评论 id 读取 */
  findCommentById: (id: number) =>
    api.get<CommentView>(`/comment/v1/findById/${id}`),

  /** 修改评论正文 */
  updateComment: (data: CommentUpdatePayload) =>
    api.post<CommentView>('/comment/v1/updateComment', data),

  /** 逻辑删除评论 */
  invalidComment: (id: number) =>
    api.post<string>(`/comment/v1/invalid/${id}`),
};
