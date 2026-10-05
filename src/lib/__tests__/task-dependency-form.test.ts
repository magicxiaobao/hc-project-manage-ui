import { describe, expect, it } from "vitest";
import {
  buildTaskDependencyPayload,
  clearDependencyFieldError,
  emptyTaskDependencyForm,
  parseDependencyId,
  validateTaskDependencyForm,
} from "../task-dependency-form";
import { DEPENDENCY_TYPES } from "../task-dependencies-live";
const candidates = [
  { id: 1, projectId: 7 },
  { id: 2, projectId: 7 },
  { id: 3, projectId: 8 },
];
const valid = () => ({ ...emptyTaskDependencyForm(), predecessorId: "1", successorId: "2" });
describe("任务依赖表单", () => {
  it("一次收集五字段全部错误", () => {
    expect(
      Object.keys(
        validateTaskDependencyForm(
          {
            predecessorId: "",
            successorId: "",
            dependencyType: "",
            lag: "-1",
            description: "字".repeat(1001),
          },
          7,
          candidates,
        ),
      ),
    ).toEqual(["predecessorId", "successorId", "dependencyType", "lag", "description"]);
  });
  it.each(["", "0", "-1", "1.1", "1e2", "NaN", "Infinity", "9007199254740992"])(
    "拒绝非法 ID %s",
    (value) => expect(parseDependencyId(value)).toBeNull(),
  );
  it("正安全 ID、候选存在、同项目与不同端点", () => {
    expect(parseDependencyId(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(validateTaskDependencyForm(valid(), 7, candidates)).toEqual({});
    expect(
      validateTaskDependencyForm({ ...valid(), successorId: "3" }, 7, candidates).successorId,
    ).toContain("当前项目");
    expect(
      validateTaskDependencyForm({ ...valid(), successorId: "4" }, 7, candidates).successorId,
    ).toContain("当前项目");
    expect(
      Object.keys(validateTaskDependencyForm({ ...valid(), successorId: "1" }, 7, candidates)),
    ).toEqual(["predecessorId", "successorId"]);
    expect(validateTaskDependencyForm(valid(), 0, candidates).predecessorId).toBeTruthy();
  });
  it.each(DEPENDENCY_TYPES.map(({ id }) => id))("接受类型 %s", (dependencyType) =>
    expect(validateTaskDependencyForm({ ...valid(), dependencyType }, 7, candidates)).toEqual({}),
  );
  it.each(["", "FS", "FINISH_TO_START", "Finish-to-start"])("拒绝类型 %s", (dependencyType) =>
    expect(
      validateTaskDependencyForm({ ...valid(), dependencyType }, 7, candidates).dependencyType,
    ).toBeTruthy(),
  );
  it.each(["", "-1", "1.1", "1e2", "NaN", "Infinity", "2147483648", " 1 ", "+1", "0x10"])(
    "拒绝 lag %s",
    (lag) =>
      expect(validateTaskDependencyForm({ ...valid(), lag }, 7, candidates).lag).toBeTruthy(),
  );
  it.each(["0", "2147483647"])("接受 lag 边界 %s", (lag) =>
    expect(validateTaskDependencyForm({ ...valid(), lag }, 7, candidates)).toEqual({}),
  );
  it("描述 trim 后空/1000 可提交，1001 不可提交", () => {
    for (const description of ["", "  ", ` ${"字".repeat(1000)} `])
      expect(validateTaskDependencyForm({ ...valid(), description }, 7, candidates)).toEqual({});
    expect(
      validateTaskDependencyForm({ ...valid(), description: "字".repeat(1001) }, 7, candidates)
        .description,
    ).toBeTruthy();
  });
  it("完整数字载荷、trim 描述、省略空描述，不偷换 wire 字段", () => {
    expect(
      buildTaskDependencyPayload({ ...valid(), lag: "3", description: " 等待验收 " }, 7),
    ).toEqual({
      predecessorId: 1,
      successorId: 2,
      projectId: 7,
      dependencyType: "finish-to-start",
      lag: 3,
      description: "等待验收",
    });
    expect(buildTaskDependencyPayload(valid(), 7)).toEqual({
      predecessorId: 1,
      successorId: 2,
      projectId: 7,
      dependencyType: "finish-to-start",
      lag: 0,
    });
  });
  it("编辑只清相关字段；任意端点清共用同值/成环错误", () => {
    const errors = {
      predecessorId: "请选择前置任务",
      successorId: "该依赖会形成循环，无法创建",
      lag: "延迟非法",
    };
    expect(clearDependencyFieldError(errors, "lag")).toEqual({
      predecessorId: errors.predecessorId,
      successorId: errors.successorId,
    });
    expect(clearDependencyFieldError(errors, "predecessorId")).toEqual({ lag: errors.lag });
    expect(
      clearDependencyFieldError(
        {
          predecessorId: "前置与后置任务不能相同",
          successorId: "后置与前置任务不能相同",
          description: "太长",
        },
        "successorId",
      ),
    ).toEqual({ description: "太长" });
  });
});
