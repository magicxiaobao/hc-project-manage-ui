import { describe, expect, it, vi } from "vitest";
import type { MenuResponse } from "../api/system-types";
import { buildMenuTree, flattenMenuTree, menuParentOptions, readAllMenuPages } from "../menu-tree";

export const menuRow = (id: number, parentId: number | null = 0, type = 2): MenuResponse => ({
  id,
  parentId,
  name: "同名",
  type,
  path: null,
  icon: null,
  openType: null,
  uri: null,
  permission: null,
  sort: 0,
  keepAlive: false,
  hidden: true,
  memo: null,
  createdAt: null,
  updatedAt: null,
});
describe("菜单双来源管理树", () => {
  it("三级关系来自分页，根列表决定有效根顺序；缺失根仍可管理，缓存字段不覆盖", () => {
    const records = [menuRow(1), menuRow(2, 1), menuRow(3, 2, 3), menuRow(4), menuRow(5)];
    const tree = buildMenuTree(records, [
      { ...menuRow(4), name: "缓存旧名称" },
      menuRow(1),
      menuRow(99),
      menuRow(2),
    ]);
    expect(tree.roots.map((node) => node.id)).toEqual([4, 1, 5]);
    expect(tree.roots[0].name).toBe("同名");
    expect(tree.roots[1].children[0].children[0].id).toBe(3);
    expect(flattenMenuTree(tree.roots, new Set()).map(({ node }) => node.id)).toEqual([4, 1, 5]);
    expect(flattenMenuTree(tree.roots, new Set([1])).map(({ node }) => node.id)).toEqual([
      4, 1, 2, 5,
    ]);
    expect(flattenMenuTree(tree.roots, new Set([1, 2])).map(({ node }) => node.id)).toEqual([
      4, 1, 2, 3, 5,
    ]);
    expect(tree.anomalies).toEqual([]);
  });
  it("根 ID 已变子节点时忽略缓存位置；sort 再 ID 稳定排序", () => {
    const tree = buildMenuTree(
      [menuRow(1), menuRow(4, 1), { ...menuRow(3, 1), sort: 2 }, menuRow(2, 1)],
      [menuRow(4)],
    );
    expect(tree.roots.map((node) => node.id)).toEqual([1]);
    expect(tree.roots[0].children.map((node) => node.id)).toEqual([2, 4, 3]);
  });
  it("孤儿、自指、循环及其后代全部保留异常区，无递归或假根；异常父级不可选", () => {
    const records = [
      menuRow(1),
      menuRow(2, 9),
      menuRow(3, 3),
      menuRow(4, 5),
      menuRow(5, 4),
      menuRow(6, 4),
    ];
    const tree = buildMenuTree(records, []);
    expect(tree.roots.map((node) => node.id)).toEqual([1]);
    expect(tree.anomalies.map((node) => node.id)).toEqual([2, 3, 4, 5, 6]);
    expect(flattenMenuTree(tree.anomalies)).toHaveLength(5);
    expect(menuParentOptions(tree, records, null).map((option) => option.id)).toEqual(["0", "1"]);
  });
  it("父级区分同名 ID、排除自身及所有后代、按钮；允许合法祖先和顶级", () => {
    const records = [
      menuRow(1),
      menuRow(2, 1),
      menuRow(3, 2),
      menuRow(4, 3),
      menuRow(5, 0, 3),
      menuRow(6),
    ];
    const options = menuParentOptions(buildMenuTree(records, []), records, 2);
    expect(options.map((option) => option.id)).toEqual(["0", "1", "6"]);
    expect(options[1].label).toContain("#1");
    expect(options[2].label).toContain("#6");
  });
  it("非法/重复 ID 不构造假完整树", () => {
    expect(() => buildMenuTree([menuRow(1), menuRow(1)], [])).toThrow("重复");
    expect(() => buildMenuTree([menuRow(0)], [])).toThrow("非法");
  });
});
describe("完整分页读取", () => {
  it("逐页读取所有页、固定请求体；所有页完成后才返回", async () => {
    const rows = Array.from({ length: 201 }, (_, index) => menuRow(index + 1));
    const fetch = vi.fn(async ({ page }: { page: number }) => ({
      list: rows.slice((page - 1) * 100, page * 100),
      pageNumber: page,
      pageSize: 100,
      total: 201,
    }));
    expect(await readAllMenuPages(fetch)).toEqual(rows);
    expect(fetch.mock.calls.map(([request]) => request)).toEqual(
      [1, 2, 3].map((page) => ({ page, pageSize: 100, bean: {} })),
    );
  });
  it("空列表及服务端不同实际 pageSize 都正确", async () => {
    expect(
      await readAllMenuPages(async () => ({ list: [], total: 0, pageNumber: 1, pageSize: 100 })),
    ).toEqual([]);
    const rows = [menuRow(1), menuRow(2), menuRow(3)];
    expect(
      await readAllMenuPages(async ({ page }) => ({
        list: rows.slice((page - 1) * 2, page * 2),
        total: 3,
        pageNumber: page,
        pageSize: 2,
      })),
    ).toEqual(rows);
  });
  it("后页失败不返回半份数据", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ list: [menuRow(1)], total: 2, pageNumber: 1, pageSize: 1 })
      .mockRejectedValueOnce(new Error("后页失败"));
    await expect(readAllMenuPages(fetch)).rejects.toThrow("后页失败");
  });
  it.each([
    "重复页",
    "重复ID",
    "错误页号",
    "大小变化",
    "总数变化",
    "空页",
    "非法ID",
    "records假契约",
  ])("拒绝 %s", async (kind) => {
    const first = { list: [menuRow(1), menuRow(2)], total: 4, pageNumber: 1, pageSize: 2 };
    let second = { ...first, list: [menuRow(3), menuRow(4)], pageNumber: 2 };
    if (kind === "重复页") second.list = first.list;
    if (kind === "重复ID") second.list = [menuRow(2), menuRow(3)];
    if (kind === "错误页号") second.pageNumber = 1;
    if (kind === "大小变化") second.pageSize = 3;
    if (kind === "总数变化") second.total = 5;
    if (kind === "空页") second.list = [];
    if (kind === "非法ID") second.list = [menuRow(0), menuRow(4)];
    if (kind === "records假契约")
      second = { ...second, list: undefined } as unknown as typeof second;
    await expect(
      readAllMenuPages(vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)),
    ).rejects.toThrow();
  });
});
