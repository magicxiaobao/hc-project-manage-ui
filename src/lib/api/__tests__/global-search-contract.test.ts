import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, createApiClient } from "../client";
import { taskApi } from "../task";
import { defectApi } from "../defect";
import { requirementApi } from "../requirement";
import { testCaseApi } from "../testCase";
import { enumerateSearchProjects } from "../../query/hooks/useGlobalSearch";
import {
  normalizeSearchKeyword,
  parseGlobalSearch,
  searchKeywordError,
} from "../../search/keyword";

const domains = [
  ["task", taskApi],
  ["defect", defectApi],
  ["requirement", requirementApi],
  ["testCase", testCaseApi],
] as const;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const empty = { list: [], total: 0, pageNumber: 1, pageSize: 10 };
const reply = (result: unknown, status = 200, code = 1) =>
  new Response(JSON.stringify({ code, msg: code === 1 ? "ok" : "权限不足", result }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue(reply(empty));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

for (const [domain, client] of domains)
  describe(domain, () => {
    it("默认 /api、POST、精确 title/projectId wrapper 与完整响应解包", async () => {
      const body = { page: 1, pageSize: 10, bean: { projectId: 7, title: "登录" } };
      const result = { ...empty, list: [{ id: 8, title: "登录", projectId: 7 }], total: 42 };
      fetchMock.mockResolvedValue(reply(result));
      expect(await client.findByPage(body)).toEqual(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`/api/${domain}/v1/findByPage`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual(body);
    });
    it("特殊字符以原始文本发送，无 keyword/name/caseNumber", async () => {
      const title = '中文 内部空格 😀 " & ? # + / % _ \\';
      await client.findByPage({ page: 1, pageSize: 10, bean: { projectId: 7, title } });
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body).toEqual({ page: 1, pageSize: 10, bean: { projectId: 7, title } });
    });
    it.each([
      [200, 2],
      [403, 403],
      [500, 500],
    ])("HTTP %s / code %s 抛错", async (status, code) => {
      fetchMock.mockResolvedValue(reply(null, status, code));
      await expect(
        client.findByPage({ page: 1, pageSize: 10, bean: { projectId: 7, title: "登录" } }),
      ).rejects.toThrow("权限不足");
    });
    it.each(["https://test.invalid/api", "https://test.invalid/gateway/"])(
      "自定义基址 %s 无重复前缀",
      async (baseUrl) => {
        const custom = createApiClient({ baseUrl, getToken: () => null });
        vi.spyOn(api, "post").mockImplementation(custom.post);
        await client.findByPage({ page: 1, pageSize: 10, bean: { projectId: 7, title: "登录" } });
        expect(fetchMock.mock.calls[0][0]).toBe(
          `${baseUrl.replace(/\/$/, "")}/${domain}/v1/findByPage`,
        );
      },
    );
  });
it("项目范围 >100、去重、非法 id/key 过滤，bean 始终 {}", async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    projectKey: `P${i + 1}`,
    projectName: `项目${i + 1}`,
  }));
  fetchMock
    .mockResolvedValueOnce(reply({ list: first, total: 105, pageNumber: 1, pageSize: 100 }))
    .mockResolvedValueOnce(
      reply({
        list: [
          first[0],
          { id: 101, projectKey: "TAIL", projectName: "尾页" },
          { id: 0, projectKey: "BAD" },
          { id: 102, projectKey: "" },
          { id: 1.5, projectKey: "BAD" },
        ],
        total: 105,
        pageNumber: 2,
        pageSize: 100,
      }),
    );
  const projects = await enumerateSearchProjects();
  expect(projects).toHaveLength(101);
  expect(projects.find((project) => project.projectKey === "TAIL")?.id).toBe(101);
  fetchMock.mock.calls.forEach(([url, init], index) => {
    expect(url).toBe("/api/project/v1/findByPage");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ page: index + 1, pageSize: 100, bean: {} });
  });
});
it("NONE scope 与空末页是完整空范围，第二页失败不能发布前 100 个", async () => {
  fetchMock.mockResolvedValue(reply({ ...empty, pageSize: 100 }));
  expect(await enumerateSearchProjects()).toEqual([]);
  const list = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    projectKey: `P${i}`,
    projectName: "项目",
  }));
  fetchMock
    .mockResolvedValueOnce(reply({ list, total: 101, pageNumber: 1, pageSize: 100 }))
    .mockResolvedValueOnce(reply(null, 403, 403));
  await expect(enumerateSearchProjects()).rejects.toThrow("权限不足");
});
it("共享规范化不截断文本、只 trim，非法深链保留供就地报错", () => {
  expect(normalizeSearchKeyword("  中 文 &?#/+%_  ")).toBe("中 文 &?#/+%_");
  expect(normalizeSearchKeyword(["登录"])).toBe("");
  expect(searchKeywordError("😀".repeat(200))).toBeUndefined();
  expect(searchKeywordError("字".repeat(201))).toContain("200");
  expect(searchKeywordError("中\u0000文")).toContain("控制字符");
  expect(parseGlobalSearch({ keyword: 1, tab: "unknown" })).toEqual({
    keyword: undefined,
    projectKey: undefined,
    tab: "task",
  });
  expect(parseGlobalSearch({ projectKey: ["HC"] }).projectKey).toBe("");
  expect(
    parseGlobalSearch({ keyword: "x".repeat(201), projectKey: "HC", tab: "defect" }).keyword,
  ).toHaveLength(201);
});
