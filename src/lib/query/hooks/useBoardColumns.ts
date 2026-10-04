/**
 * 看板列域 react-query hooks（P3：p3-board-kanban 任务看板）。
 *
 * 约定（沿用 useBoards.ts）：
 * - queryKey 一律走 queryKeys.board.*，不手写数组；
 * - 列+卡片完整数据走 GET /boardColumn/v1/board/{boardId}/columnsWithTasks，
 *   key 用 board.list({ columnsWithTasks: boardId })；
 * - boardId 无效时 disabled，不发起请求；
 * - 写操作（列 CRUD/重排序）成功后失效看板域全部缓存；
 *   卡片跨列拖拽的状态变更复用 useTasks 的 useUpdateTaskStatus，
 *   看板页在组件层做乐观更新 + 失败回滚（refetch）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { boardColumnApi } from '../../api/board';
import type {
  BoardColumnCreatePayload,
  BoardColumnUpdatePayload,
} from '../../api/board-types';
import { parseBoardColumnsWithTasks } from '../../board-kanban';
import { queryKeys } from '../keys';

/** 看板列+任务完整数据的 queryKey 参数形状（保持 key 形状一致，缓存不拆散） */
export function normalizeBoardColumnsParams(boardId: number) {
  return { columnsWithTasks: boardId };
}

/**
 * 看板列 + 卡片：走 GET /boardColumn/v1/board/{boardId}/columnsWithTasks。
 * 后端返回 List<Map<String,Object>>（BoardColumnServiceImpl 拼装）；
 * select 里用 parseBoardColumnsWithTasks 防御性解释为 KanbanBoardColumn[]
 *（缓存即存解析后数据，组件层的乐观更新直接操作同一形状，类型一致）。
 */
export function useBoardColumnsWithTasks(boardId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.board.list(
      normalizeBoardColumnsParams(boardId ?? 0),
    ),
    queryFn: () => boardColumnApi.getColumnsWithTasks(boardId as number),
    select: parseBoardColumnsWithTasks,
    enabled: typeof boardId === 'number' && Number.isFinite(boardId) && boardId > 0,
  });
}

/** 看板域变更的缓存失效：失效看板域全部缓存（列/卡片数据下次读取即刷新） */
export function invalidateBoardDomain(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.board.all });
}

/**
 * 新建看板列：走 POST /boardColumn/v1/createBoardColumn（后端返回新建列 id）。
 * 成功后失效看板域全部缓存。
 */
export function useCreateBoardColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BoardColumnCreatePayload) =>
      boardColumnApi.createBoardColumn(data),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/** 更新看板列：走 POST /boardColumn/v1/updateBoardColumn（字段级更新，id 必传） */
export function useUpdateBoardColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BoardColumnUpdatePayload) =>
      boardColumnApi.updateBoardColumn(data),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/**
 * 删除看板列：走 POST /boardColumn/v1/delete/{id}。
 * 注意：老前端误调 /boardColumn/v1/invalid/{id}（后端无此端点，必 404），
 * 此处按后端 BoardColumnController:77 建模。
 */
export function useDeleteBoardColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => boardColumnApi.deleteBoardColumn(id),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}

/**
 * 看板列拖拽重排序：走 POST /boardColumn/v1/reorder，请求体 { ids: number[] }
 *（后端读 body.get("ids")，按数组顺序重写 sortOrder）。
 */
export function useReorderBoardColumns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => boardColumnApi.reorder(ids),
    onSuccess: () => invalidateBoardDomain(queryClient),
  });
}
