/**
 * 追溯 API。契约忠实于 hc-project-manage 后端：
 * - RequirementTraceController（requirement/v1/trace）：GET {requirementId}/
 *   {requirementId}/impact；POST matrix/findByPage
 * - TraceabilityRelationController（/traceability/v1/relations）：POST /link/
 *   /unlink//relink//batch-query（后端已就绪、老前端零接线；P3 只建 link/unlink/
 *   batch-query 三个方法的客户端，relink 暂不做 UI 但建模保留）
 * - ⚠️ POST requirement/v1/trace/{requirementId}/export 为 xlsx 导出，
 *   P3 明确排除，不建模
 */
import { api } from './client';
import { assertBatchRelations } from '../trace-relations';
import { assertMatrixPage } from '../trace-matrix';
import type { PageRequest, PageResult } from './types';
import type {
  AlmRelation,
  BatchRelationQueryPayload,
  BatchRelationResult,
  LinkRelationPayload,
  RequirementImpact,
  RequirementMatrixQuery,
  RequirementMatrixRow,
  RequirementTrace,
  UnlinkRelationPayload,
} from './trace-types';

export const requirementTraceApi = {
  /** 需求追溯详情：GET */
  getTrace: (requirementId: number) =>
    api.get<RequirementTrace>(`/requirement/v1/trace/${requirementId}`),

  /** 需求影响范围：GET */
  getImpact: (requirementId: number) =>
    api.get<RequirementImpact>(`/requirement/v1/trace/${requirementId}/impact`),

  /** 追溯矩阵分页：POST，请求体 { page, pageSize, bean }（bean.projectId 必填） */
  findMatrix: async (params: PageRequest<RequirementMatrixQuery>): Promise<PageResult<RequirementMatrixRow>> => {
    const result = await api.post<PageResult<RequirementMatrixRow>>(
      '/requirement/v1/trace/matrix/findByPage', params,
    );
    assertMatrixPage(result);
    return result;
  },
};

export const traceabilityRelationApi = {
  /** 创建人工关系：POST，返回关系（项目/Actor/source/status 由服务端确定） */
  link: (data: LinkRelationPayload) =>
    api.post<AlmRelation>('/traceability/v1/relations/link', data),

  /** 解除人工关系：POST，reason 必填 */
  unlink: (data: UnlinkRelationPayload) =>
    api.post<AlmRelation>('/traceability/v1/relations/unlink', data),

  /** 重新激活关系：POST（P3 暂不做 UI，客户端建模保留） */
  relink: (data: UnlinkRelationPayload) =>
    api.post<AlmRelation>('/traceability/v1/relations/relink', data),

  /** 批量关系双向查询：POST，objects 非空 */
  batchQuery: async (data: BatchRelationQueryPayload): Promise<BatchRelationResult> => {
    const result = await api.post<BatchRelationResult>('/traceability/v1/relations/batch-query', data);
    assertBatchRelations(result);
    return result;
  },
};
