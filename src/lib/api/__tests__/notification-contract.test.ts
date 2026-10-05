import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationApi } from '../notification';
import type {
  NotificationCreatePayload,
  NotificationUpdatePayload,
  NotificationQueryRequest,
  NotificationResponse,
} from '../notification-types';
import type { PageRequest } from '../types';

// 仅替换模块单例的配置，get/post/request 与错误处理使用真实统一客户端。
vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return {
    ...actual,
    api: actual.createApiClient({ baseUrl: 'http://test', getToken: () => 'collab-token' }),
  };
});

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function reply(result: unknown, status = 200, code = 1) {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ code, msg: code === 1 ? 'ok' : '参数错误', result }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  reply(null);
});

afterEach(() => vi.unstubAllGlobals());

function pathAndMethod(path: string, method: 'GET' | 'POST') {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input, init] = fetchMock.mock.calls[0];
  const url = new URL(String(input));
  expect(url.pathname).toBe(path);
  expect(init?.method).toBe(method);
  return { url, init };
}

function request(path: string, method: 'GET' | 'POST', body?: unknown) {
  const sent = pathAndMethod(path, method);
  if (body === undefined) expect(sent.init?.body).toBeUndefined();
  else {
    expect(new Headers(sent.init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(sent.init?.body))).toEqual(body);
  }
  return sent;
}

const payload = {
  title: '通知',
  content: null,
  type: '任务分配',
  status: '',
  receiverId: 0,
  senderId: 4,
  isRead: false,
  readTime: '2026-10-05T09:00:00',
} satisfies NotificationCreatePayload;
const update = { ...payload, id: 7 } satisfies NotificationUpdatePayload;
const notification = {
  ...payload,
  id: 7,
  createdAt: 0,
  updatedAt: null,
  priority: '高',
} satisfies NotificationResponse;
const page = {
  page: 2,
  pageSize: 5,
  bean: {
    title: '通知',
    type: '系统通知',
    status: '',
    receiverId: 0,
    isRead: false,
    keyword: '登录 & + #',
    startTime: '2026-10-05T00:00:00Z',
    endTime: '2026-10-05T23:59:59+00:00',
  },
  sorts: { createdAt: 'desc' },
} satisfies PageRequest<NotificationQueryRequest>;

describe('notificationApi（12 个端点）', () => {
  it('createNotification：完整 body，无 priority，Long 解包', async () => {
    reply(7);
    expect(await notificationApi.createNotification(payload)).toBe(7);
    const { init } = request('/notification/v1/createNotification', 'POST', payload);
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('priority');
  });
  it('updateNotification：定位 id、false/0/null，无 priority', async () => {
    reply('更新成功');
    expect(await notificationApi.updateNotification(update)).toBe('更新成功');
    const { init } = request('/notification/v1/updateNotification', 'POST', update);
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('priority');
  });
  it.each([
    ['validNotification', '/notification/v1/valid/7'],
    ['invalidNotification', '/notification/v1/invalid/7'],
  ] as const)('%s：无 body 的 POST 与 String 返回', async (method, path) => {
    reply('成功');
    expect(await notificationApi[method](7)).toBe('成功');
    request(path, 'POST');
  });
  it('getById：响应 priority、nullable scalar、false、0 原样返回', async () => {
    reply(notification);
    expect(await notificationApi.getById(7)).toEqual(notification);
    request('/notification/v1/findById/7', 'GET');
  });
  it('findByPage：中文枚举、false、keyword、ISO Instant 与精确 wrapper', async () => {
    const result = { list: [notification], total: 1, pageNumber: 2, pageSize: 5 };
    reply(result);
    expect(await notificationApi.findByPage(page)).toEqual(result);
    request('/notification/v1/findByPage', 'POST', page);
  });
  it('send：直接 NotificationCreatePayload', async () => {
    reply('发送成功');
    expect(await notificationApi.send(payload)).toBe('发送成功');
    request('/notification/v1/send', 'POST', payload);
  });
  it('sendBatch：直接数组，无 requests 外壳', async () => {
    const batch = [payload, { ...payload, receiverId: 5 }];
    reply('发送成功');
    expect(await notificationApi.sendBatch(batch)).toBe('发送成功');
    request('/notification/v1/sendBatch', 'POST', batch);
  });
  it('markAsRead：id/userId 只在 path，无 body', async () => {
    reply('成功');
    expect(await notificationApi.markAsRead(7, 4)).toBe('成功');
    request('/notification/v1/markAsRead/7/4', 'POST');
  });
  it('markAllAsRead：userId 只在 path，无 body', async () => {
    reply('成功');
    expect(await notificationApi.markAllAsRead(4)).toBe('成功');
    request('/notification/v1/markAllAsRead/4', 'POST');
  });
  it('getUnreadCount：Integer 解包，0 可用', async () => {
    reply(0);
    expect(await notificationApi.getUnreadCount(4)).toBe(0);
    request('/notification/v1/unreadCount/4', 'GET');
  });
  it('pageNotification：精确 Page wrapper，无顶层 userId', async () => {
    const result = { list: [notification], total: 1, pageNumber: 2, pageSize: 5 };
    reply(result);
    expect(await notificationApi.pageNotification(4, page)).toEqual(result);
    const { init } = request('/notification/v1/pageNotification/4', 'POST', page);
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('userId');
  });
  it('pageNotification：未筛选 bean={}，空页与 total=0 原样返回', async () => {
    const unfiltered = { page: 1, pageSize: 10, bean: {} };
    const result = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
    reply(result);
    expect(await notificationApi.pageNotification(4, unfiltered)).toEqual(result);
    request('/notification/v1/pageNotification/4', 'POST', unfiltered);
  });
});
