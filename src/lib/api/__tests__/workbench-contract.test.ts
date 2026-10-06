import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { taskApi } from "../task";
import { workLogApi } from "../worklog";
import { notificationApi } from "../notification";
import { enumerateSearchProjects } from "../../query/hooks/useGlobalSearch";
import { WORKBENCH_STATUSES, workbenchTaskParams } from "../../workbench-data";
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const reply = (result: unknown) =>
  new Response(JSON.stringify({ code: 1, msg: "ok", result }), {
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
it("枚举第二页进入完整范围，标准项目 POST wrapper", async () => {
  fetchMock
    .mockResolvedValueOnce(
      reply({
        list: [{ id: 7, projectKey: "A", projectName: "A" }],
        total: 101,
        pageNumber: 1,
        pageSize: 100,
      }),
    )
    .mockResolvedValueOnce(
      reply({
        list: [{ id: 101, projectKey: "TAIL", projectName: "尾页" }],
        total: 101,
        pageNumber: 2,
        pageSize: 100,
      }),
    );
  expect((await enumerateSearchProjects()).map((p) => p.id)).toEqual([7, 101]);
  fetchMock.mock.calls.forEach(([url, init], index) => {
    expect(new URL(String(url), "http://test").pathname).toBe("/api/project/v1/findByPage");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ page: index + 1, pageSize: 100, bean: {} });
  });
});
it.each(WORKBENCH_STATUSES)("待办 %s 只发送单状态、项目与执行人，客户端解包", async (status) => {
  const data = {
    list: [{ id: 1, title: "真实任务", projectId: 7, assigneeId: 42, status }],
    total: 21,
    pageNumber: 1,
    pageSize: 10,
  };
  fetchMock.mockResolvedValue(reply(data));
  const params = workbenchTaskParams(7, 42, status);
  expect(await taskApi.findByPage(params)).toEqual(data);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/task/v1/findByPage");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({
    page: 1,
    pageSize: 10,
    bean: { projectId: 7, assigneeId: 42, status },
  });
});
it("未定型工时契约仅验证路径与 GET", async () => {
  fetchMock.mockResolvedValue(reply(null));
  await workLogApi.getUserStatistics(42, {
    startDate: "2026-10-05",
    endDate: "2026-10-06",
    projectIds: [7, 101],
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(new URL(String(url), "http://test").pathname).toBe("/api/workLog/v1/statistics/user/42");
  expect(init?.method).toBe("GET");
});
it("通知沿用已有计数端点，0 解包", async () => {
  fetchMock.mockResolvedValue(reply(0));
  expect(await notificationApi.getUnreadCount(42)).toBe(0);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/notification/v1/unreadCount/42");
  expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
});
