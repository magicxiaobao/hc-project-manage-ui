/**
 * 看板域 react-query hooks（P3：p3-board-manage 看板列表管理）。
 *
 * 约定（沿用 useTestCases.ts / useDefects.ts）：
 * - queryKey 一律走 queryKeys.board.*，不手写数组
 * - 请求参数在 hook 内归一化（默认值 page=1、pageSize=20、bean={}），
 *   保证同一语义的查询 key 形状一致，缓存不被拆散
 * - 列表 hook 的 projectId 为 null/undefined 时 disabled，不发起请求
 *   （看板列表始终按项目过滤，走 POST /board/v1/project/{projectId}/findByPage，
 *   bean.projectId 必传，后端 validatePageRequest 会直接报业务码）
 * - 状态变更一律 POST：归档=POST /board/v1/archive/{id}、激活=POST /board/v1/activate/{id}、
 *   设默认=POST /board/v1/setDefault/{id}、复制=POST /board/v1/copy/{id}?newBoardName=xxx
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { boardApi } from '../../api/board';
import type {
  BoardCreatePayload,
  BoardQueryRequest,
  BoardUpdatePayload,
} from '../../api/board-types';
import { queryKeys } from '../keys';

export interface BoardListParams {
  page?: number;
  pageSize?: number;
  bean?: Omit<BoardQueryRequest, 'projectId'>;
  /** 所属项目 id；null/undefined 时不发起请求（调用方等待 projectKey→id 解析） */
  projectId?: number | null;
}

export function normalizeBoardListParams(params: BoardListParams = {}) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
    bean: { ...params.bean, projectId: params.projectId ?? 0 },
  };
}

/**
 * 看板列表（分页）：走 POST /board/v1/project/{projectId}/findByPage；
 * 筛选=看板名称/看板类型/状态。
 */
export function useBoardList(params: BoardListParams = {}) {
  const { projectId } = params;
  const normalized = normalizeBoardListParams(params);
  return useQuery({
    queryKey: queryKeys.board.list(normalized),
    queryFn: () => boardApi.findByProject(projectId as number, normalized),
    enabled: typeof projectId === 'number' && Number.isFinite(projectId),
  });
}

/** 看板详情：走 GET /board/v1/findById/{id}；id 无效时 disabled */
export function useBoardDetail(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.board.detail(id ?? 0),
    queryFn: () => boardApi.getById(id as number),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
  });
}

/** 看板域变更的缓存失效：失效看板域全部缓存（列表变脏，下次读取即刷新） */
function invalidateBoardDomain(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.board.all });
}

/**
 * 新建看板：走 POST /board/v1/createBoard（后端返回新建看板 id）。
 * 成功后失效看板域全部缓存。
 */
export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BoardCreatePayload) => boardApi.createBoard(data),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/** 更新看板：走 POST /board/v1/updateBoard（字段级更新，id 必传） */
export function useUpdateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BoardUpdatePayload) => boardApi.updateBoard(data),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/**
 * 复制看板：走 POST /board/v1/copy/{id}?newBoardName=xxx（后端返回新看板 id）。
 * 成功后失效看板域缓存（列表里出现新副本）。
 */
export function useCopyBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newBoardName }: { id: number; newBoardName: string }) =>
      boardApi.copyBoard(id, newBoardName),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/**
 * 归档看板：走 POST /board/v1/archive/{id}（独立归档状态，与 invalid 语义不同）。
 * 成功后失效看板域缓存。
 */
export function useArchiveBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => boardApi.archiveBoard(id),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/**
 * 激活看板：走 POST /board/v1/activate/{id}（归档→可用的逆操作）。
 * 成功后失效看板域缓存。
 */
export function useActivateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => boardApi.activateBoard(id),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/**
 * 设为默认看板：走 POST /board/v1/setDefault/{id}。
 * 成功后失效看板域缓存（默认徽标即时更新）。
 */
export function useSetDefaultBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => boardApi.setDefault(id),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}
