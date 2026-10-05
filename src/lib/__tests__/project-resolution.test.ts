/**
 * 项目 key→id 解析的 lastGood 缓存规则回归测试（P3：p3-gantt r25-2）。
 *
 * 背景：路由用 lastGood 在后台重取失败时保留已挂载图表；但"解析成功返回
 * null（项目不存在）"是权威结论，必须清除该 key 的 lastGood，否则之后
 * 重取失败会回退到旧项目 id、显示错项目。
 */
import { describe, expect, it } from "vitest";
import { nextLastGoodProject } from "../query/hooks/useProjects";

describe("nextLastGoodProject", () => {
  it("解析返回数字 → 更新为 { key, id }", () => {
    expect(
      nextLastGoodProject(null, "PROJ", { isPending: false, isError: false, data: 123 }),
    ).toEqual({ key: "PROJ", id: 123 });
  });

  it("解析成功返回 null → 同 key 的 lastGood 被清除", () => {
    expect(
      nextLastGoodProject(
        { key: "PROJ", id: 123 },
        "PROJ",
        { isPending: false, isError: false, data: null },
      ),
    ).toBeNull();
  });

  it("解析成功返回 null → 不同 key 的 lastGood 不受影响", () => {
    const current = { key: "OTHER", id: 7 };
    expect(
      nextLastGoodProject(current, "PROJ", { isPending: false, isError: false, data: null }),
    ).toBe(current);
  });

  it("pending 中 → 保持原值", () => {
    const current = { key: "PROJ", id: 123 };
    expect(
      nextLastGoodProject(current, "PROJ", { isPending: true, isError: false, data: undefined }),
    ).toBe(current);
  });

  it("重取失败 → 保持原值（后台失败保留图表的依据）", () => {
    const current = { key: "PROJ", id: 123 };
    expect(
      nextLastGoodProject(current, "PROJ", { isPending: false, isError: true, data: undefined }),
    ).toBe(current);
  });

  it("复现 r25-2：123 → null → error，最终不再回退到 123", () => {
    let lastGood = nextLastGoodProject(null, "PROJ", {
      isPending: false,
      isError: false,
      data: 123,
    });
    expect(lastGood).toEqual({ key: "PROJ", id: 123 });
    lastGood = nextLastGoodProject(lastGood, "PROJ", {
      isPending: false,
      isError: false,
      data: null,
    });
    expect(lastGood).toBeNull();
    // 之后重取失败：无 lastGood 可回退，路由走"项目解析失败"错误态而非旧项目
    lastGood = nextLastGoodProject(lastGood, "PROJ", {
      isPending: false,
      isError: true,
      data: undefined,
    });
    expect(lastGood).toBeNull();
  });
});
