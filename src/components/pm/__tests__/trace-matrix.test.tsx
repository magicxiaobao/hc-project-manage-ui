import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import * as hooks from "@/lib/query/hooks/useRequirements";
import { TraceMatrixLive } from "../trace-matrix-live";
import { TraceMatrixTable } from "../trace-matrix-table";
import { TraceNodeSummaryBadge } from "../trace-node-summary-badge";
import { matrixFixture, emptyRelations, summary } from "@/lib/__tests__/fixtures/trace-matrix";
import {
  TEST_CASE_STATUS_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  DEFECT_STATUS_LABEL,
} from "@/lib/pm/domain";
import type { AlmObjectType } from "@/lib/api/trace-types";

describe("矩阵表格展示", () => {
  it("每行一个需求、四列、无版本列；关联状态投影只影响对应列", () => {
    const html = renderToString(
      <TraceMatrixTable rows={[matrixFixture()]} filters={{ taskStatus: "COMPLETED" }} />,
    );
    for (const title of ["需求", "任务", "用例", "缺陷"])
      expect(html).toContain(
        `scope="col"` + ` class="type-section border-b border-border px-3 py-3 text-left">${title}`,
      );
    expect(html).not.toContain("TASK-TODO");
    expect(html).toContain("TASK-COMPLETED");
    expect(html).toContain("TEST_CASE-DRAFT");
    expect(html).toContain("DEFECT-NEW");
    expect(html).not.toContain("版本9");
    expect(html.match(/data-node="REQUIREMENT:/g)).toHaveLength(1);
  });
  it("三列未覆盖；仅版本证据不改变覆盖；筛选下附说明", () => {
    for (const row of [
      emptyRelations(),
      { ...emptyRelations(), versionEvidence: matrixFixture().versionEvidence },
    ]) {
      const html = renderToString(
        <TraceMatrixTable rows={[row]} filters={{ taskStatus: "PAUSED" }} />,
      );
      expect(html.match(/未覆盖/g)).toHaveLength(3);
      expect(html).toContain("当前状态筛选下");
    }
    const html = renderToString(
      <TraceMatrixTable rows={[{ ...matrixFixture(), taskSummaries: [] }]} />,
    );
    expect(html.match(/未覆盖/g)).toHaveLength(1);
  });
  it("整页空态不虚构未覆盖需求行", () => {
    expect(renderToString(<TraceMatrixTable rows={[]} />)).toContain("暂无需求矩阵数据");
    const html = renderToString(
      <TraceMatrixTable rows={[]} filters={{ requirementStatus: "REVIEW" }} />,
    );
    expect(html).toContain("没有符合条件的需求");
    expect(html).not.toContain("未覆盖");
  });
  it("null与未知状态保留节点，缺失标题回退对象名与ID", () => {
    const html = renderToString(
      <TraceNodeSummaryBadge node={{ ...summary("TASK", 2, null), displayName: null }} />,
    );
    expect(html).toContain("任务 #2");
    expect(html).toContain("状态未知");
    expect(html).not.toContain("未覆盖");
    expect(
      renderToString(<TraceNodeSummaryBadge node={summary("DEFECT", 3, "CUSTOM")} />),
    ).toContain("pm-state-chip--neutral");
    expect(renderToString(<TraceNodeSummaryBadge node={summary("TASK", 3, "REVIEW")} />)).toContain(
      "pm-state-chip--neutral",
    );
  });
  it("复用四类既有状态文案和色调（归档用例为红）", () => {
    const dictionaries: [AlmObjectType, Record<string, string>][] = [
      ["REQUIREMENT", REQUIREMENT_STATUS_LABEL],
      ["TASK", TASK_STATUS_LABEL],
      ["TEST_CASE", TEST_CASE_STATUS_LABEL],
      ["DEFECT", DEFECT_STATUS_LABEL],
    ];
    for (const [type, labels] of dictionaries)
      for (const [status, label] of Object.entries(labels)) {
        const html = renderToString(<TraceNodeSummaryBadge node={summary(type, 1, status)} />);
        expect(html).toContain(label);
        expect(html).toContain("pm-state-chip--");
      }
    expect(
      renderToString(<TraceNodeSummaryBadge node={summary("TEST_CASE", 1, "ARCHIVED")} />),
    ).toContain("pm-state-chip--danger");
  });
});

describe("矩阵加载、错误与分页输出", () => {
  afterEach(() => vi.restoreAllMocks());
  function renderResult(overrides: Record<string, unknown>) {
    vi.spyOn(hooks, "useTraceMatrix").mockReturnValue({
      isFetching: false,
      isError: false,
      isSuccess: true,
      data: undefined,
      refetch: vi.fn(),
      ...overrides,
    } as unknown as ReturnType<typeof hooks.useTraceMatrix>);
    return renderToString(<TraceMatrixLive projectId={7} />);
  }
  it("失败显示原错误与重试，不显示成功空态", () => {
    for (const message of ["无矩阵权限", "ARCHIVED 用例已失效", "响应契约错误", "网络断开"]) {
      const html = renderResult({ isError: true, isSuccess: false, error: new Error(message) });
      expect(html).toContain(message);
      expect(html).toContain("重试");
      expect(html).not.toContain("暂无需求矩阵数据");
      expect(html).not.toContain("未覆盖");
      vi.restoreAllMocks();
    }
  });
  it("同key后台刷新失败保留成功表格并诚实标注", () => {
    const html = renderResult({
      isError: true,
      isSuccess: false,
      error: new Error("刷新失败"),
      data: { list: [matrixFixture()], total: 1, pageNumber: 1, pageSize: 20 },
    });
    expect(html).toContain("数据为上次成功的结果");
    expect(html).toContain("需求追溯矩阵");
    expect(html).toContain("TASK-TODO");
  });
  it("缓存空结果刷新失败仍展示错误，不冒充成功空态", () => {
    const html = renderResult({
      isError: true,
      isSuccess: false,
      error: new Error("刷新失败"),
      data: { list: [], total: 0, pageNumber: 1, pageSize: 20 },
    });
    expect(html).toContain("刷新失败");
    expect(html).toContain("上次成功");
    expect(html).not.toContain("暂无需求矩阵数据");
    expect(html).toContain("矩阵分页");
  });
  it("新key加载不展示旧行或空态", () => {
    const html = renderResult({ isFetching: true, isSuccess: false });
    expect(html).toContain("正在加载矩阵");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("暂无需求矩阵数据");
  });
  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
  ])("total=%i分页使用服务端需求总数", (total, pages) => {
    const html = renderResult({
      data: { list: total ? [matrixFixture()] : [], total, pageNumber: 1, pageSize: 20 },
    });
    const text = html.replace(/<!--.*?-->/g, "");
    expect(text).toContain(`共 ${total} 条需求`);
    expect(text).toContain(`第 1 / ${pages} 页`);
    expect(text).toContain("每页 20 条");
    expect(html).toContain("矩阵分页");
  });
});
