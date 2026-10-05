import { describe, expect, it } from "vitest";
import {
  assertMatrixPage,
  matrixColumnNodes,
  matrixTotalPages,
  normalizeMatrixParams,
  MATRIX_STATUS_FIELDS,
} from "../trace-matrix";
import { matrixFixture, emptyRelations } from "./fixtures/trace-matrix";
const page = (row: unknown = matrixFixture()) => ({
  list: [row],
  total: 1,
  pageNumber: 1,
  pageSize: 20,
});

describe("矩阵分页与契约", () => {
  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [40, 2],
    [41, 3],
  ])("total=%i → %i 页", (total, pages) => expect(matrixTotalPages(total)).toBe(pages));
  it("固定20条，全部字段省略，路由ID覆盖bean，不发送旧字段", () => {
    const params = normalizeMatrixParams({
      projectId: 7,
      pageSize: 100,
      bean: {
        projectId: 99,
        requirementStatus: "",
        taskStatus: undefined,
        title: "wrong",
        status: "wrong",
      } as never,
    });
    expect(params).toEqual({ page: 1, pageSize: 20, bean: { projectId: 7 } });
    for (const field of MATRIX_STATUS_FIELDS)
      expect(normalizeMatrixParams({ projectId: 7, bean: { [field]: "ACTIVE" } }).bean[field]).toBe(
        "ACTIVE",
      );
  });
  it("行内混合状态只投影当前列，不变更原数组和total", () => {
    const row = matrixFixture();
    expect(matrixColumnNodes(row.taskSummaries, "COMPLETED").map((n) => n.objectId)).toEqual([3]);
    expect(matrixColumnNodes(row.testCaseSummaries, "ACTIVE").map((n) => n.objectId)).toEqual([5]);
    expect(matrixColumnNodes(row.defectSummaries, "RESOLVED").map((n) => n.objectId)).toEqual([7]);
    expect(row.taskSummaries).toHaveLength(2);
    expect(matrixColumnNodes(row.taskSummaries)).toBe(row.taskSummaries);
    expect(matrixColumnNodes(row.taskSummaries, "PAUSED")).toEqual([]);
  });
  it("空列表、无关联、仅版本证据与合法null状态均是成功响应", () => {
    for (const value of [
      { list: [], total: 0, pageNumber: 1, pageSize: 20 },
      page(emptyRelations()),
      page({ ...emptyRelations(), versionEvidence: matrixFixture().versionEvidence }),
      page({
        ...matrixFixture(),
        taskSummaries: [{ ...matrixFixture().taskSummaries[0], status: null }],
      }),
    ])
      expect(() => assertMatrixPage(value)).not.toThrow();
  });
  it.each([
    "requirement",
    "taskSummaries",
    "testCaseSummaries",
    "defectSummaries",
    "versionEvidence",
  ])("%s为null时报契约错误", (field) =>
    expect(() => assertMatrixPage(page({ ...matrixFixture(), [field]: null }))).toThrow(
      "响应契约错误",
    ),
  );
  it("非法path、证据与分页不降级为空", () => {
    expect(() => assertMatrixPage(page({ ...matrixFixture(), taskSummaries: [null] }))).toThrow(
      "响应契约错误",
    );
    expect(() =>
      assertMatrixPage(
        page({ ...matrixFixture(), requirement: { ...matrixFixture().requirement, path: [] } }),
      ),
    ).toThrow("响应契约错误");
    expect(() =>
      assertMatrixPage(
        page({ ...matrixFixture(), versionEvidence: { total: 1, truncated: false, items: [] } }),
      ),
    ).toThrow("响应契约错误");
    expect(() => assertMatrixPage({ ...page(), total: null })).toThrow("响应契约错误");
  });
});
