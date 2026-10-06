import { api } from './client';
import type { PageRequest, PageResult } from './types';
import type {
  NotificationCreatePayload,
  NotificationUpdatePayload,
  NotificationQueryRequest,
  NotificationResponse,
} from './notification-types';

/** CRUD/发送要求 system:admin；此模块仅提供 API。 */
export const notificationApi = {
  createNotification: (payload: NotificationCreatePayload) =>
    api.post<number>('/notification/v1/createNotification', payload),
  updateNotification: (payload: NotificationUpdatePayload) =>
    api.post<string>('/notification/v1/updateNotification', payload),
  validNotification: (id: number) => api.post<string>(`/notification/v1/valid/${id}`),
  invalidNotification: (id: number) => api.post<string>(`/notification/v1/invalid/${id}`),
  getById: (id: number) => api.get<NotificationResponse>(`/notification/v1/findById/${id}`),
  findByPage: (page: PageRequest<NotificationQueryRequest>) =>
    api.post<PageResult<NotificationResponse>>('/notification/v1/findByPage', page),
  send: (payload: NotificationCreatePayload) => api.post<string>('/notification/v1/send', payload),
  sendBatch: (payloads: NotificationCreatePayload[]) =>
    api.post<string>('/notification/v1/sendBatch', payloads),
  /** 下列四个用户端点均按当前用户处理，路径 userId 不提供跨用户操作能力。 */
  markAsRead: (id: number, userId: number) =>
    api.post<string>(`/notification/v1/markAsRead/${id}/${userId}`),
  markAllAsRead: (userId: number) => api.post<string>(`/notification/v1/markAllAsRead/${userId}`),
  getUnreadCount: (userId: number) => api.get<number>(`/notification/v1/unreadCount/${userId}`),
  /** receiverId 不能承诺跨用户访问；userId 仅在路径，page 原样发送。 */
  pageNotification: (userId: number, page: PageRequest<NotificationQueryRequest>) =>
    api.post<PageResult<NotificationResponse>>(`/notification/v1/pageNotification/${userId}`, page),
};
