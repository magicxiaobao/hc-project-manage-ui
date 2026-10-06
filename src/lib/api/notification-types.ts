/**
 * P4 notification 契约：依据 spec §3.1 / §3.7 的后端 DTO/VO。
 * 请求无 JsonProperty 别名或 Submitted 协议；CRUD/查询可选字段不代表业务接受空对象。
 * 仅 undefined 在 JSON 序列化时省略，null 不保证显式清空能力；false/0/空串原样保留。
 * LocalDate: YYYY-MM-DD；LocalDateTime: YYYY-MM-DDTHH:mm:ss；Instant: 带时区 ISO-8601。
 * 响应保留 null；createdAt/updatedAt 为 Long → number，Unix 秒时间戳。
 */

/** 查询专用中文枚举；create/update/response 的 type 仍为 string。 */
export type NotificationQueryType =
  '系统通知' | '任务分配' | '任务完成' | '缺陷报告' | '项目更新' | '评论回复' | '截止日期提醒';

/** 写入 DTO 不包含 priority。 */
export interface NotificationCreatePayload {
  title?: string | null;
  content?: string | null;
  type?: string | null;
  status?: string | null;
  receiverId?: number | null;
  senderId?: number | null;
  isRead?: boolean | null;
  readTime?: string | null;
}

/** id 为前端定位必填（DTO 无 @NotNull）；写入 DTO 不包含 priority。 */
export interface NotificationUpdatePayload {
  title?: string | null;
  content?: string | null;
  type?: string | null;
  status?: string | null;
  receiverId?: number | null;
  senderId?: number | null;
  isRead?: boolean | null;
  readTime?: string | null;
  id: number;
}

/** type 使用 @JsonValue 中文名。startTime/endTime 是带时区 ISO-8601 Instant，按创建时间闭区间查询。 */
export interface NotificationQueryRequest {
  title?: string | null;
  type?: NotificationQueryType | null;
  status?: string | null;
  receiverId?: number | null;
  isRead?: boolean | null;
  keyword?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface NotificationResponse {
  id: number;
  createdAt: number | null;
  updatedAt: number | null;
  title: string | null;
  content: string | null;
  type: string | null;
  status: string | null;
  receiverId: number | null;
  senderId: number | null;
  isRead: boolean | null;
  readTime: string | null;
  priority: string | null;
}
