import { describe, expect, it } from "vitest";
import {
  buildMenuCreatePayload,
  buildMenuUpdatePayload,
  emptyMenuFormInput,
  menuFormInputFromResponse,
  menuFormSnapshot,
  parseMenuSelection,
  rebaseMenuFormOnVersionConflict,
  validateMenuFormInput,
} from "../menu-form";
import type { MenuResponse } from "../api/system-types";
import { SubmitSessionGuard } from "../user-form";
const parents = { ready: true, ids: new Set([0, 1]) };
describe("菜单表单", () => {
  it("默认数值类型；全部错误一次返回，不把空 key 转 0", () => {
    expect(emptyMenuFormInput()).toMatchObject({ type: 2, openType: 1, parentId: 0 });
    expect(parseMenuSelection("")).toBeNull();
    expect(parseMenuSelection("2")).toBe(2);
    const errors = validateMenuFormInput(
      { ...emptyMenuFormInput(), type: null, openType: 9, parentId: 2, name: " " },
      parents,
    );
    expect(errors.map((error) => error.field)).toEqual(["name", "type", "openType", "parentId"]);
  });
  it.each([null, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, NaN])("父级非法 %s 被拒绝", (parentId) => {
    expect(
      validateMenuFormInput({ ...emptyMenuFormInput(), name: "按钮", parentId }, parents).some(
        (error) => error.field === "parentId",
      ),
    ).toBe(true);
  });
  it("结构未就绪/失败给 parentId 错误，顶级也不能冒充完整结构", () => {
    expect(
      validateMenuFormInput(
        { ...emptyMenuFormInput(), name: "目录" },
        { ...parents, ready: false },
      ),
    ).toEqual([{ field: "parentId", message: "完整菜单结构尚未加载成功，请刷新后再保存" }]);
  });
  it("path 可空、permission 任意文本；精确载荷 trim、清空文本、移根 0，无扩展字段", () => {
    const input = {
      ...emptyMenuFormInput(),
      name: " 名称 ",
      permission: " 随意 文本:/ ",
      parentId: 0,
    };
    expect(validateMenuFormInput(input, parents)).toEqual([]);
    const expected = {
      name: "名称",
      type: 2,
      parentId: 0,
      path: "",
      icon: "",
      openType: 1,
      uri: "",
      permission: "随意 文本:/",
    };
    expect(buildMenuCreatePayload(input)).toEqual(expected);
    expect(buildMenuUpdatePayload(8, input)).toEqual({ id: 8, ...expected });
  });
  it("响应 null 归一、openType null 省略，完整快照逐字段 dirty/改回干净", () => {
    const initial = menuFormInputFromResponse({
      name: null,
      type: null,
      parentId: null,
      path: null,
      icon: null,
      openType: null,
      uri: null,
      permission: null,
    } as MenuResponse);
    expect(initial).toEqual({
      name: "",
      type: null,
      parentId: 0,
      path: "",
      icon: "",
      openType: null,
      uri: "",
      permission: "",
    });
    expect(buildMenuCreatePayload(initial)).not.toHaveProperty("openType");
    for (const field of Object.keys(initial) as (keyof typeof initial)[]) {
      const changed = { ...initial, [field]: typeof initial[field] === "string" ? "改动" : 2 };
      expect(menuFormSnapshot(changed)).not.toBe(menuFormSnapshot(initial));
      changed[field] = initial[field] as never;
      expect(menuFormSnapshot(changed)).toBe(menuFormSnapshot(initial));
    }
  });
  it("详情版本冲突保留用户修改，其他字段采用新详情；关闭/换目标令牌失效", () => {
    const initial = { ...emptyMenuFormInput(), name: "旧名称" };
    const server = { ...initial, name: "新名称", icon: "new" };
    expect(rebaseMenuFormOnVersionConflict(initial, { ...initial, uri: "草稿" }, server)).toEqual({
      ...server,
      uri: "草稿",
    });
    const guard = new SubmitSessionGuard();
    const session = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(session)).toBe(false);
    expect(guard.isCurrent(guard.begin())).toBe(true);
  });
});
