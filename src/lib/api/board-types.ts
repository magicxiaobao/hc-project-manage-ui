/**
 * P3 看板契约类型。
 *
 * 忠实映射 hc-project-manage 后端 BoardController（board/v1）与
 * BoardColumnController（boardColumn/v1）：
 * - 看板：POST createBoard/updateBoard/valid/{id}/invalid/{id}/findByPage/
 *   project/{projectId}/findByPage/setDefault/{id}/sprint/{sprintId}/create/
 *   archive/{id}/activate/{id}/copy/{id}；GET findById/{id}/
 *   project/{projectId}/default/sprint/{sprintId}
 * - 看板列：POST createBoardColumn/updateBoardColumn/delete/{id}/reorder/
 *   findByPage；GET board/{boardId}/columnsWithTasks/findById/{id}
 * - ⚠️ BoardController 的 GET/POST config/{id}（看板配置）为 P3 明确排除项，不建模
 * - ⚠️ 老前端 api/board.ts 的 boardColumnApi.delete 调 /boardColumn/v1/invalid/{id}
 *   （后端无此端点，必 404），正确端点是 POST /boardColumn/v1/delete/{id}，此处按后端建模
 * - createBoard/createSprintBoard/copyBoard 返回新建看板 id（Long）；其它写操作返回
 *   后端成功消息字符串（Result<String>），前端按 string 接收不解析语义
 * - reorder 请求体为 { ids: number[] }（后端读 body.get("ids")）
 * - columnsWithTasks 返回 List<Map<String,Object>>（后端实现拼装列+卡片），
 *   前端类型化为 Record<string, unknown>[]，业务语义在看板组件层解释
 * - 日期后端为 LocalDateTime，老前端收发格式为 'YYYY-MM-DDTHH:mm:ss' 字符串，
 *   此处类型化为 string
 */

/** 看板创建载荷（忠实于后端 BoardCreateRequest） */
export interface BoardCreatePayload {
  boardName: string;
  description?: string;
  boardType?: string;
  projectId: number;
  sprintId?: number;
  status?: string;
  boardConfig?: string;
  isDefault?: boolean;
  ownerId?: number;
  sortOrder?: number;
  wipLimits?: string;
  wipEnabled?: boolean;
  filterConfig?: string;
  isPublic?: boolean;
}

/** 看板更新载荷（忠实于后端 BoardUpdateRequest；含 id） */
export interface BoardUpdatePayload extends Partial<BoardCreatePayload> {
  id: number;
}

/** 看板查询条件（忠实于后端 BoardQueryRequest） */
export interface BoardQueryRequest {
  boardName?: string;
  boardType?: string;
  projectId?: number;
  sprintId?: number;
  status?: string;
  ownerId?: number;
}

/** 看板（忠实于后端 BoardResponse；日期为 'YYYY-MM-DDTHH:mm:ss' 字符串） */
export interface BoardResponse {
  id: number;
  boardName: string;
  description?: string | null;
  boardType?: string | null;
  projectId: number;
  sprintId?: number | null;
  status?: string | null;
  boardConfig?: string | null;
  isDefault?: boolean | null;
  ownerId?: number | null;
  sortOrder?: number | null;
  wipLimits?: string | null;
  wipEnabled?: boolean | null;
  filterConfig?: string | null;
  isPublic?: boolean | null;
}

/** 看板列创建载荷（忠实于后端 BoardColumnCreateRequest） */
export interface BoardColumnCreatePayload {
  boardId: number;
  columnName: string;
  description?: string;
  /** 映射到任务状态机状态（老前端称 taskStatus，值走任务状态枚举） */
  taskStatus?: string;
  sortOrder?: number;
  wipLimit?: number;
  wipEnabled?: boolean;
  /** 十六进制颜色串 */
  color?: string;
  isSystem?: boolean;
  columnType?: string;
  isVisible?: boolean;
  columnConfig?: string;
}

/** 看板列更新载荷（忠实于后端 BoardColumnUpdateRequest；含 id） */
export interface BoardColumnUpdatePayload extends Partial<BoardColumnCreatePayload> {
  id: number;
}

/** 看板列查询条件（忠实于后端 BoardColumnQueryRequest） */
export interface BoardColumnQueryRequest {
  boardId?: number;
  columnName?: string;
  taskStatus?: string;
}

/** 看板列（忠实于后端 BoardColumnResponse） */
export interface BoardColumnResponse {
  id: number;
  boardId: number;
  columnName: string;
  description?: string | null;
  taskStatus?: string | null;
  sortOrder?: number | null;
  wipLimit?: number | null;
  wipEnabled?: boolean | null;
  color?: string | null;
  isSystem?: boolean | null;
  columnType?: string | null;
  isVisible?: boolean | null;
  columnConfig?: string | null;
}

/**
 * 看板列 + 任务完整数据（忠实于 GET /boardColumn/v1/board/{boardId}/columnsWithTasks，
 * 后端返回 List<Map<String,Object>>，由实现拼装；前端按泛型记录接收，
 * 渲染层按实际返回的列字段 + tasks 数组解释）
 */
export type BoardColumnWithTasks = Record<string, unknown>;
