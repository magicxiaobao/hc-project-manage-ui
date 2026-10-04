/**
 * 看板 API。契约忠实于 hc-project-manage 后端：
 * - BoardController（/board/v1）：createBoard/updateBoard/valid/{id}/invalid/{id}/
 *   findByPage/project/{projectId}/findByPage/project/{projectId}/default/
 *   setDefault/{id}/sprint/{sprintId}/sprint/{sprintId}/create/archive/{id}/
 *   activate/{id}/copy/{id}。状态变更一律 POST。
 * - BoardColumnController（/boardColumn/v1）：createBoardColumn/updateBoardColumn/
 *   delete/{id}/reorder/board/{boardId}/columnsWithTasks/findByPage/findById/{id}。
 *   注意列删除是 POST delete/{id}（老前端误调 invalid/{id}，必 404）
 * - ⚠️ GET/POST /board/v1/config/{id}（看板配置）为 P3 明确排除项，不建模
 * - POST /board/v1/sprint/{sprintId}/create 与 copy/{id} 的名称以查询参数传递
 *   （@RequestParam），POST 请求体为空
 */
import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  BoardColumnCreatePayload,
  BoardColumnQueryRequest,
  BoardColumnResponse,
  BoardColumnUpdatePayload,
  BoardColumnWithTasks,
  BoardCreatePayload,
  BoardQueryRequest,
  BoardResponse,
  BoardUpdatePayload,
} from './board-types';

export const boardApi = {
  /** 新建看板：返回新建看板 id */
  createBoard: (data: BoardCreatePayload) =>
    api.post<number>('/board/v1/createBoard', data),

  /** 更新看板：字段级更新，返回后端成功消息 */
  updateBoard: (data: BoardUpdatePayload) =>
    api.post<string>('/board/v1/updateBoard', data),

  /** 启用看板：id 拼在路径上 */
  validBoard: (id: number) => api.post<string>(`/board/v1/valid/${id}`),

  /** 归档看板（逻辑删）：id 拼在路径上 */
  invalidBoard: (id: number) => api.post<string>(`/board/v1/invalid/${id}`),

  /** 看板详情：GET */
  getById: (id: number) => api.get<BoardResponse>(`/board/v1/findById/${id}`),

  /** 看板分页查询：标准分页请求体 { page, pageSize, bean } */
  findByPage: (params: PageRequest<BoardQueryRequest>) =>
    api.post<PageResult<BoardResponse>>('/board/v1/findByPage', params),

  /** 项目看板分页：projectId 拼在路径上，请求体仍为标准分页 */
  findByProject: (projectId: number, params: PageRequest<BoardQueryRequest>) =>
    api.post<PageResult<BoardResponse>>(
      `/board/v1/project/${projectId}/findByPage`,
      params,
    ),

  /** 项目默认看板：GET */
  getDefaultByProject: (projectId: number) =>
    api.get<BoardResponse>(`/board/v1/project/${projectId}/default`),

  /** 设为默认看板：id 拼在路径上 */
  setDefault: (id: number) => api.post<string>(`/board/v1/setDefault/${id}`),

  /** 冲刺看板：GET；冲刺无看板时后端返回 null（页面层判断后调 createSprintBoard） */
  getSprintBoard: (sprintId: number) =>
    api.get<BoardResponse | null>(`/board/v1/sprint/${sprintId}`),

  /**
   * 为冲刺创建看板：POST，无请求体，boardName 以查询参数传递；
   * 返回新建看板 id
   */
  createSprintBoard: (sprintId: number, boardName: string) =>
    api.post<number>(
      `/board/v1/sprint/${sprintId}/create?boardName=${encodeURIComponent(boardName)}`,
    ),

  /** 归档看板：id 拼在路径上（与 invalid 语义不同，后端独立状态） */
  archiveBoard: (id: number) => api.post<string>(`/board/v1/archive/${id}`),

  /** 激活看板：id 拼在路径上 */
  activateBoard: (id: number) => api.post<string>(`/board/v1/activate/${id}`),

  /**
   * 复制看板：POST，newBoardName 以查询参数传递；
   * 返回新看板 id
   */
  copyBoard: (id: number, newBoardName: string) =>
    api.post<number>(
      `/board/v1/copy/${id}?newBoardName=${encodeURIComponent(newBoardName)}`,
    ),
};

export const boardColumnApi = {
  /** 新建看板列：返回新建列 id */
  createBoardColumn: (data: BoardColumnCreatePayload) =>
    api.post<number>('/boardColumn/v1/createBoardColumn', data),

  /** 更新看板列：字段级更新，返回后端成功消息 */
  updateBoardColumn: (data: BoardColumnUpdatePayload) =>
    api.post<string>('/boardColumn/v1/updateBoardColumn', data),

  /**
   * 删除看板列：POST delete/{id}（不是 invalid/{id}；
   * 老前端调错成 invalid/{id} 必 404，此处按后端建模）
   */
  deleteBoardColumn: (id: number) =>
    api.post<string>(`/boardColumn/v1/delete/${id}`),

  /** 列拖拽重排序：请求体 { ids: number[] }（后端读 body.get("ids")） */
  reorder: (ids: number[]) =>
    api.post<string>('/boardColumn/v1/reorder', { ids }),

  /**
   * 看板列 + 任务完整数据：GET；返回 List<Map>（列字段 + tasks 数组由后端实现拼装）
   */
  getColumnsWithTasks: (boardId: number) =>
    api.get<BoardColumnWithTasks[]>(`/boardColumn/v1/board/${boardId}/columnsWithTasks`),

  /** 看板列分页查询：标准分页请求体 */
  findByPage: (params: PageRequest<BoardColumnQueryRequest>) =>
    api.post<PageResult<BoardColumnResponse>>('/boardColumn/v1/findByPage', params),

  /** 看板列详情：GET */
  getById: (id: number) =>
    api.get<BoardColumnResponse>(`/boardColumn/v1/findById/${id}`),
};
