/**
 * P3 任务依赖契约类型。
 *
 * 忠实映射 hc-project-manage 后端 TaskDependencyController（taskDependency/v1）：
 * - POST createTaskDependency/updateTaskDependency/valid/{id}/invalid/{id}/
 *   findByPage/detectConflicts/batchDelete/getStatistics/checkCircularDependency；
 *   GET findById/{id}/getPredecessors/{taskId}/getSuccessors/{taskId}
 * - detectConflicts/getStatistics 请求体为 { projectId }（后端读 body.get("projectId")，
 *   projectId 可空）
 * - batchDelete 请求体为 { ids: number[] }（后端读 body.get("ids")）
 * - checkCircularDependency 请求体复用 TaskDependencyCreateRequest，
 *   后端仅用 predecessorId/successorId 判断，返回 boolean
 * - create 返回新建依赖 id（后端 Result<Long>）；update/valid/invalid 返回成功消息字符串
 * - ⚠️ 老前端 TaskDependency.vue 调 taskDependencyApi.export：该方法在老前端
 *   api/task.ts 中根本不存在（死代码），P3 明确排除不建模
 */

/** 依赖创建载荷（忠实于后端 TaskDependencyCreateRequest） */
export interface TaskDependencyCreatePayload {
  predecessorId: number;
  successorId: number;
  /** 依赖类型字符串（如 FINISH_TO_START 等，后端无枚举硬校验） */
  dependencyType?: string;
  /** 提前/滞后天数 */
  lag?: number;
  description?: string;
  projectId: number;
}

/** 依赖更新载荷（忠实于后端 TaskDependencyUpdateRequest；含 id） */
export interface TaskDependencyUpdatePayload
  extends Partial<TaskDependencyCreatePayload> {
  id: number;
}

/** 依赖查询条件（忠实于后端 TaskDependencyQueryRequest） */
export interface TaskDependencyQueryRequest {
  predecessorId?: number;
  successorId?: number;
  dependencyType?: string;
  projectId?: number;
}

/** 任务依赖（忠实于后端 TaskDependencyResponse extends AbstractResponse；createdAt/updatedAt 为秒级时间戳） */
export interface TaskDependencyResponse {
  id: number;
  predecessorId: number;
  successorId: number;
  dependencyType?: string | null;
  lag?: number | null;
  description?: string | null;
  status?: string | null;
  projectId: number;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 冲突检测项（后端返回 List<Map<String,Object>>，由实现拼装） */
export type DependencyConflict = Record<string, unknown>;

/** 依赖统计（后端返回 Map<String,Object>，由实现拼装） */
export type DependencyStatistics = Record<string, unknown>;
