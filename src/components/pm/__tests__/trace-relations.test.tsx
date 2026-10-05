import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as query from "@/lib/query";
import { TraceRelationsSection } from "../trace-relations-section";
import { batchRelationFixture, relationFixture } from "@/lib/__tests__/fixtures/trace-relations";
const auth = vi.hoisted(() => ({ authenticated: true }));
vi.mock("@/lib/api/auth-store", () => ({ useAuthStore: () => auth.authenticated }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/query", () => ({
  useTraceRelations: vi.fn(),
  useTraceObjectTitle: vi.fn(),
  toUserMessage: (error: Error) => error.message,
}));
const row = relationFixture({ relationSource: "BUSINESS_ACTION" });
const context = { object: row.targetObject, title: "需求标题", projectId: 7, projectKey: "PROJ" };
beforeEach(() => {
  auth.authenticated = true;
  vi.clearAllMocks();
  vi.mocked(query.useTraceRelations).mockReturnValue({
    data: batchRelationFixture(row),
    isPending: false,
    isFetching: false,
    isError: false,
  } as unknown as ReturnType<typeof query.useTraceRelations>);
  vi.mocked(query.useTraceObjectTitle).mockReturnValue({
    data: { id: 201, title: "任务标题", projectId: 7 },
    isPending: false,
    isError: false,
  } as ReturnType<typeof query.useTraceObjectTitle>);
});
describe("关联区静态展示（不冒充弹窗点击验证）", () => {
  it("未登录/非法对象不暴露新建解除入口，读取门控关闭", () => {
    for (const mode of ["unauthenticated", "invalid"] as const) {
      auth.authenticated = mode !== "unauthenticated";
      const props =
        mode === "invalid" ? { ...context, object: { ...context.object, objectId: 0 } } : context;
      const html = renderToString(<TraceRelationsSection {...props} />);
      expect(html).not.toContain("新建关联");
      expect(html).not.toContain(">解除<");
      expect(query.useTraceRelations).toHaveBeenLastCalledWith(
        expect.objectContaining({ contextVerified: false }),
      );
    }
  });
  it("incoming 展示原始源→目标、wire 类型及业务来源，白名单仍有解除入口", () => {
    const html = renderToString(<TraceRelationsSection {...context} />);
    for (const text of [
      "其他对象关联到此对象（incoming）",
      "任务 #201 任务标题",
      "需求 #101 需求标题",
      "TASK_IMPLEMENTS_REQUIREMENT",
      "BUSINESS_ACTION",
      "解除",
      "新建关联",
    ])
      expect(html).toContain(text);
  });
  it("白名单外类型仍可读且无解除入口", () => {
    const readOnly = relationFixture({
      sourceObject: { objectType: "VERSION", objectId: 9 },
      targetObject: context.object,
      relationType: "VERSION_CONTAINS_REQUIREMENT",
    });
    vi.mocked(query.useTraceRelations).mockReturnValue({
      data: batchRelationFixture(readOnly),
      isPending: false,
      isFetching: false,
      isError: false,
    } as unknown as ReturnType<typeof query.useTraceRelations>);
    const html = renderToString(<TraceRelationsSection {...context} />);
    expect(html).toContain("版本 #9");
    expect(html).toContain("VERSION_CONTAINS_REQUIREMENT");
    expect(html).toContain("只读关系");
    expect(html).not.toContain("解除");
  });
  it("成功空态与读取错误不同，后台失败保留旧边并标记过期", () => {
    vi.mocked(query.useTraceRelations).mockReturnValue({
      data: { items: [{ object: context.object, outgoing: [], incoming: [] }] },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof query.useTraceRelations>);
    expect(renderToString(<TraceRelationsSection {...context} />)).toContain("暂无关联");
    vi.mocked(query.useTraceRelations).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("读取失败"),
    } as unknown as ReturnType<typeof query.useTraceRelations>);
    const failed = renderToString(<TraceRelationsSection {...context} />);
    expect(failed).toContain("读取失败");
    expect(failed).toContain("重试关联");
    expect(failed).not.toContain("暂无关联");
    vi.mocked(query.useTraceRelations).mockReturnValue({
      data: batchRelationFixture(row),
      isPending: false,
      isError: true,
      error: new Error("刷新失败"),
    } as unknown as ReturnType<typeof query.useTraceRelations>);
    const stale = renderToString(<TraceRelationsSection {...context} />);
    expect(stale).toContain("上次数据可能已过期");
    expect(stale).toContain("任务 #201");
  });
  it("标题读取失败保留类型 ID 并可重试", () => {
    vi.mocked(query.useTraceObjectTitle).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("标题失败"),
    } as ReturnType<typeof query.useTraceObjectTitle>);
    const html = renderToString(<TraceRelationsSection {...context} />);
    expect(html).toContain("任务 #201");
    expect(html).toContain("标题加载失败");
    expect(html).toContain("重试标题");
  });
});
