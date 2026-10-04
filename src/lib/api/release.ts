/**
 * 发布 API。契约忠实于 hc-project-manage 后端 ReleaseController（release/v1）：
 * - POST create，返回发布草稿响应（idempotencyKey 防重）
 * - POST updateDraft，整包覆盖（省略字段即清空，forceUpdate 省略回退 false）+ 可选 adminReason
 * - POST findByPage，标准分页请求体 { page, pageSize, bean }（bean：projectId/versionId 二选一必填）
 * - GET findById/{id}，返回发布详情（含范围快照/门禁/审批/产物证据）
 * - GET {id}/previewGates，预览发布门禁裁决数组
 * - POST {id}/waiveGate 与 {id}/revokeWaiver，请求体 { gateType, reason }（需 project:admin）
 * - POST {id}/submit：提交审批，无请求体
 * - POST {id}/approve 与 {id}/reject 与 {id}/cancel，请求体 { reason }（需 project:admin）
 * - POST {id}/recordReleased，请求体 ReleaseSuccessPayload
 *   （buildNumber/artifactLocation/fileHash 必填非空白，fileSize ≥0 可选）
 * - POST {id}/recordFailed，请求体 ReleaseFailurePayload
 *   （resultNotes 必填；三件套齐全（fileSize 可选，若传须 ≥0），或四项全空，半套抛错）
 * - POST {id}/copyAsDraft 与 {id}/rollbackAsDraft，请求体 { idempotencyKey }，
 *   返回新草稿响应
 * - POST {id}/deleteDraft：body 可选（仅草稿态；无 adminReason 时不带 body）
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  ReleaseClonePayload,
  ReleaseCreatePayload,
  ReleaseDetailResponse,
  ReleaseDraftUpdatePayload,
  ReleaseGateDecision,
  ReleaseGateType,
  ReleasePageQuery,
  ReleaseResponse,
  ReleaseFailurePayload,
  ReleaseSuccessPayload,
} from './release-types';

export const releaseApi = {
  /** 创建发布草稿：返回发布响应 */
  createRelease: (data: ReleaseCreatePayload) =>
    api.post<ReleaseResponse>('/release/v1/create', data),

  /** 更新发布草稿：整包覆盖（省略即写 null，forceUpdate 省略回退 false） */
  updateDraft: (data: ReleaseDraftUpdatePayload) =>
    api.post<string>('/release/v1/updateDraft', data),

  /** 分页查询发布：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<ReleasePageQuery>) =>
    api.post<PageResult<ReleaseResponse>>('/release/v1/findByPage', params),

  /** 按 id 查询发布详情：返回 release + 范围/门禁/审批/产物证据 */
  findById: (id: number) =>
    api.get<ReleaseDetailResponse>(`/release/v1/findById/${id}`),

  /** 预览发布门禁：GET，返回门禁裁决数组 */
  previewGates: (id: number) =>
    api.get<ReleaseGateDecision[]>(`/release/v1/${id}/previewGates`),

  /** 豁免门禁：请求体 { gateType, reason }（需 project:admin） */
  waiveGate: (id: number, gateType: ReleaseGateType, reason: string) =>
    api.post<string>(`/release/v1/${id}/waiveGate`, { gateType, reason }),

  /** 撤销门禁豁免：请求体 { gateType, reason }（需 project:admin） */
  revokeWaiver: (id: number, gateType: ReleaseGateType, reason: string) =>
    api.post<string>(`/release/v1/${id}/revokeWaiver`, { gateType, reason }),

  /** 提交发布审批：id 拼在路径上，无请求体 */
  submitRelease: (id: number) =>
    api.post<string>(`/release/v1/${id}/submit`),

  /** 审批通过发布：请求体 { reason }（需 project:admin） */
  approveRelease: (id: number, reason: string) =>
    api.post<string>(`/release/v1/${id}/approve`, { reason }),

  /** 驳回发布：请求体 { reason }（需 project:admin） */
  rejectRelease: (id: number, reason: string) =>
    api.post<string>(`/release/v1/${id}/reject`, { reason }),

  /** 记录发布成功：制品三件套必填且非空白 */
  recordReleased: (id: number, data: ReleaseSuccessPayload) =>
    api.post<string>(`/release/v1/${id}/recordReleased`, data),

  /** 记录发布失败：resultNotes 必填；三件套齐全（fileSize 可选）或四项全空 */
  recordFailed: (id: number, data: ReleaseFailurePayload) =>
    api.post<string>(`/release/v1/${id}/recordFailed`, data),

  /** 取消发布：请求体 { reason }（需 project:admin） */
  cancelRelease: (id: number, reason: string) =>
    api.post<string>(`/release/v1/${id}/cancel`, { reason }),

  /** 复制为发布草稿：请求体 { idempotencyKey }，返回新草稿响应 */
  copyAsDraft: (id: number, data: ReleaseClonePayload) =>
    api.post<ReleaseResponse>(`/release/v1/${id}/copyAsDraft`, data),

  /** 回滚为发布草稿：请求体 { idempotencyKey }，返回新草稿响应 */
  rollbackAsDraft: (id: number, data: ReleaseClonePayload) =>
    api.post<ReleaseResponse>(`/release/v1/${id}/rollbackAsDraft`, data),

  /** 删除发布草稿：无 adminReason 时不带 body（后端 @RequestBody(required=false)） */
  deleteDraft: (id: number, adminReason?: string) =>
    api.post<string>(
      `/release/v1/${id}/deleteDraft`,
      adminReason ? { adminReason } : undefined,
    ),
};
