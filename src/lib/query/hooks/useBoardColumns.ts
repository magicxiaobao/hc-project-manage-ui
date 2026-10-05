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
 * 解析在 queryFn 返回前完成（parseBoardColumnsWithTasks），缓存里存的即是
 * 规范形状 KanbanBoardColumn[]——组件层乐观更新直接操作同一形状，类型一致，
 * 不再依赖 select 只转换 observer 输出（此前缓存仍是原始响应，
 * setQueryData 的类型断言并不成立，异常形状下 .tasks.find 会抛 TypeError）。
 */
export function useBoardColumnsWithTasks(boardId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.board.list(
      normalizeBoardColumnsParams(boardId ?? 0),
    ),
    queryFn: async () =>
      parseBoardColumnsWithTasks(
        await boardColumnApi.getColumnsWithTasks(boardId as number),
      ),
    enabled: typeof boardId === 'number' && Number.isFinite(boardId) && boardId > 0,
    // 跨域投影（Codex review 4183634372/4183634379/4183634386）：任务的流转/
    // 新建/改派/依赖等写入散落在任务域各 mutation，逐个补失效既漏不全、也会
    // 打断看板自身的乐观刷新协调。改为进入页面时总是重取，不吃 30s staleTime。
    refetchOnMount: 'always',
  });
}

/** 看板域变更的缓存失效：失效看板域全部缓存（列/卡片数据下次读取即刷新） */
export function invalidateBoardDomain(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.board.all });
}

/**
 * r8 R5：失效除指定看板外的其它看板列+卡片缓存。
 * 卡片流转改变任务状态，其它看板按任务状态聚合且有 30 秒新鲜期——A 看板
 * 流转成功后直接打开此前缓存的 B 看板，不失效会显示旧状态。
 * 调用方看板的 columnsKey 刚经过协调的权威刷新（authoritativeBoardRefresh），
 * 保持新鲜不失效；其余看板域缓存全部失效。
 */
export function invalidateOtherBoardColumns(
  queryClient: ReturnType<typeof useQueryClient>,
  boardId: number,
) {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.board.all,
    predicate: (query) => {
      const key = query.queryKey;
      // 当前看板的列+卡片查询：['hc','board','list',{columnsWithTasks: boardId}]
      return !(
        key.length === 4 &&
        key[0] === "hc" &&
        key[1] === "board" &&
        key[2] === "list" &&
        typeof key[3] === "object" &&
        key[3] !== null &&
        (key[3] as { columnsWithTasks?: unknown }).columnsWithTasks === boardId
      );
    },
  });
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
