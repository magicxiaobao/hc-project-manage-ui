/**
 * 发布域 react-query hooks（P2：p2-release-lifecycle 垂直切片）。
 *
 * 约定（沿用 useVersions.ts / useReleaseEnvironments.ts）：
 * - queryKey 一律走 queryKeys.release.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId/versionId 二选一必填（后端 ReleasePageQuery 联合
 *   口径，fail-closed）：两者都缺时 disabled，不发起请求
 * - 变更成功后失效发布域全部缓存
 *
 * 门禁实时预览（GET /release/v1/{id}/previewGates）是按需动作而非页面
 * 首屏数据：usePreviewReleaseGates 初始 disabled，由详情页按钮 refetch。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { releaseApi } from '../../api/release';
import type {
  ReleaseClonePayload,
  ReleaseCreatePayload,
  ReleaseDraftUpdatePayload,
  ReleaseFailurePayload,
  ReleaseGateType,
  ReleasePageQuery,
  ReleaseResponse,
  ReleaseSuccessPayload,
} from '../../api/release-types';
import { queryKeys } from '../keys';

export interface ReleaseListParams {
  page?: number;
  pageSize?: number;
  /**
   * 所属项目 id；与 versionId 二选一必填（后端 bean 联合口径 fail-closed）。
   * 列表页通常按版本上下文查询（versionId），此时 projectId 仅用于归一化 key。
   */
  projectId?: number | null;
  /** 版本 id；传了 versionId 则 bean 走版本分支（环境可选） */
  versionId?: number | null;
  /** 环境 id；可选的 bean 过滤条件 */
  environmentId?: number;
}

/**
 * 发布列表参数归一化（纯函数，可独立测试）：
 * - versionId 优先（版本上下文列表）：bean = { versionId[, environmentId] }
 * - 否则 bean = { projectId[, environmentId] }
 */
export function normalizeReleaseListParams(params: ReleaseListParams = {}) {
  const environmentFilter =
    params.environmentId != null ? { environmentId: params.environmentId } : {};
  const bean: ReleasePageQuery =
    typeof params.versionId === 'number' && Number.isFinite(params.versionId)
      ? { versionId: params.versionId, ...environmentFilter }
      : { projectId: params.projectId ?? 0, ...environmentFilter };
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean,
  };
}

/** 发布列表（分页）：走 POST /release/v1/findByPage；bean 走版本或项目分支 */
export function useReleaseList(params: ReleaseListParams = {}) {
  const { projectId, versionId } = params;
  const normalized = normalizeReleaseListParams(params);
  const hasScope =
    (typeof versionId === 'number' && Number.isFinite(versionId)) ||
    (typeof projectId === 'number' && Number.isFinite(projectId));
  return useQuery({
    queryKey: queryKeys.release.list(normalized),
    queryFn: () => releaseApi.findByPage(normalized),
    enabled: hasScope,
  });
}

/** 全量拉取的单页大小（与版本下拉现有 pageSize=100 口径一致） */
const FETCH_ALL_PAGE_SIZE = 100;

export interface ReleaseListAllParams {
  /**
   * 所属项目 id；与 versionId 二选一必填（后端 bean 联合口径 fail-closed，
   * 与 useReleaseList 一致）。列表页通常按版本上下文查询（versionId）。
   */
  projectId?: number | null;
  /** 版本 id；传了 versionId 则 bean 走版本分支 */
  versionId?: number | null;
}

/**
 * 发布全量列表（循环分页，供本地筛选+本地分页使用）：
 * 走 POST /release/v1/findByPage（bean 只带 projectId/versionId；后端
 * ReleasePageRequest 无 status 字段，状态筛选只能在前端做——codex r24 P2-4）。
 * 循环拉取所有页直到某页返回不足一页（沿用 P3 useBoardListAll 先例），
 * 返回合并后的 ReleaseResponse[]。
 * key 用 list({ all: true, ... }) 与分页查询区分；失效走 queryKeys.release.all 全域。
 */
export function useReleaseListAll(params: ReleaseListAllParams = {}) {
  const { projectId, versionId } = params;
  const hasScope =
    (typeof versionId === 'number' && Number.isFinite(versionId)) ||
    (typeof projectId === 'number' && Number.isFinite(projectId));
  const bean: ReleasePageQuery =
    typeof versionId === 'number' && Number.isFinite(versionId)
      ? { versionId }
      : { projectId: projectId ?? 0 };
  return useQuery({
    queryKey: queryKeys.release.list({ all: true, pageSize: FETCH_ALL_PAGE_SIZE, bean }),
    queryFn: async () => {
      const all: ReleaseResponse[] = [];
      let page = 1;
      for (;;) {
        const pageResult = await releaseApi.findByPage({
          page,
          pageSize: FETCH_ALL_PAGE_SIZE,
          bean,
        });
        all.push(...pageResult.list);
        if (pageResult.list.length < FETCH_ALL_PAGE_SIZE) break;
        page += 1;
      }
      return all;
    },
    enabled: hasScope,
  });
}

/** 发布详情：走 GET /release/v1/findById/{id}；id 无效时 disabled */
export function useReleaseDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.release.detail(id ?? 0),
    queryFn: () => releaseApi.findById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/**
 * 门禁实时预览：走 GET /release/v1/{id}/previewGates。
 * 初始 disabled：详情页「预览实时门禁」按钮手动 refetch。
 */
export function usePreviewReleaseGates(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.release.gates(id ?? 0),
    queryFn: () => releaseApi.previewGates(id as number),
    enabled: false,
  });
}

/** 发布域变更的缓存失效：发布域（列表变脏，下次读取即出现新发布/新状态） */
function invalidateReleaseDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.release.all });
}

/**
 * 创建发布草稿：走 POST /release/v1/create（返回发布响应，含 id）。
 * 成功后失效发布域全部缓存。
 */
export function useCreateReleaseDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReleaseCreatePayload) => releaseApi.createRelease(data),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 更新发布草稿：走 POST /release/v1/updateDraft（整包覆盖，省略字段即写 null，
 * forceUpdate 省略回退 false）。成功后失效发布域全部缓存。
 */
export function useUpdateReleaseDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReleaseDraftUpdatePayload) => releaseApi.updateDraft(data),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 删除发布草稿：走 POST /release/v1/{id}/deleteDraft（仅草稿态；
 * adminReason 可选）。成功后失效发布域全部缓存。
 */
export function useDeleteReleaseDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      releaseId,
      adminReason,
    }: {
      releaseId: number;
      adminReason?: string;
    }) => releaseApi.deleteDraft(releaseId, adminReason),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 提交发布审批：走 POST /release/v1/{id}/submit（无请求体）。
 * 成功后失效发布域全部缓存。
 */
export function useSubmitRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: number) => releaseApi.submitRelease(releaseId),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 审批通过发布：走 POST /release/v1/{id}/approve（请求体 { reason }，
 * 需 project:admin）。成功后失效发布域全部缓存。
 */
export function useApproveRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, reason }: { releaseId: number; reason: string }) =>
      releaseApi.approveRelease(releaseId, reason),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 驳回发布：走 POST /release/v1/{id}/reject（请求体 { reason }，
 * 需 project:admin）。成功后失效发布域全部缓存。
 */
export function useRejectRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, reason }: { releaseId: number; reason: string }) =>
      releaseApi.rejectRelease(releaseId, reason),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 取消发布：走 POST /release/v1/{id}/cancel（请求体 { reason }，
 * 需 project:admin）。成功后失效发布域全部缓存。
 */
export function useCancelRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ releaseId, reason }: { releaseId: number; reason: string }) =>
      releaseApi.cancelRelease(releaseId, reason),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 豁免门禁：走 POST /release/v1/{id}/waiveGate（请求体 { gateType, reason }，
 * 需 project:admin）。成功后失效发布域全部缓存。
 */
export function useWaiveReleaseGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      releaseId,
      gateType,
      reason,
    }: {
      releaseId: number;
      gateType: ReleaseGateType;
      reason: string;
    }) => releaseApi.waiveGate(releaseId, gateType, reason),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 撤销门禁豁免：走 POST /release/v1/{id}/revokeWaiver（请求体
 * { gateType, reason }，需 project:admin）。成功后失效发布域全部缓存。
 */
export function useRevokeReleaseWaiver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      releaseId,
      gateType,
      reason,
    }: {
      releaseId: number;
      gateType: ReleaseGateType;
      reason: string;
    }) => releaseApi.revokeWaiver(releaseId, gateType, reason),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 记录发布成功：走 POST /release/v1/{id}/recordReleased（制品三件套必填）。
 * 成功后失效发布域全部缓存。
 */
export function useRecordReleased() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      releaseId,
      data,
    }: {
      releaseId: number;
      data: ReleaseSuccessPayload;
    }) => releaseApi.recordReleased(releaseId, data),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 记录发布失败：走 POST /release/v1/{id}/recordFailed（resultNotes 必填；
 * 制品证据可选但必须完整三件套或全空）。成功后失效发布域全部缓存。
 */
export function useRecordFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      releaseId,
      data,
    }: {
      releaseId: number;
      data: ReleaseFailurePayload;
    }) => releaseApi.recordFailed(releaseId, data),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 复制为发布草稿：走 POST /release/v1/{id}/copyAsDraft（请求体
 * { idempotencyKey }，返回新草稿响应）。成功后失效发布域全部缓存。
 */
export function useCopyReleaseAsDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      releaseId,
      data,
    }: {
      releaseId: number;
      data: ReleaseClonePayload;
    }) => releaseApi.copyAsDraft(releaseId, data),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}

/**
 * 回滚为发布草稿：走 POST /release/v1/{id}/rollbackAsDraft（请求体
 * { idempotencyKey }，返回新草稿响应）。成功后失效发布域全部缓存。
 */
export function useRollbackReleaseAsDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      releaseId,
      data,
    }: {
      releaseId: number;
      data: ReleaseClonePayload;
    }) => releaseApi.rollbackAsDraft(releaseId, data),
    onSuccess: () => invalidateReleaseDomain(queryClient),
  });
}
