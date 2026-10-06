import { describe, expect, it } from "vitest";
import type { PermissionResponse } from "../api/system-types";
import {
  createPermissionSnapshot,
  filterMissingNewPermissionIds,
  groupCheckState,
  groupPermissions,
  normalizePermissionIds,
  parseRoleId,
  permissionSnapshotDirty,
  samePermissionIds,
  serializePermissionSelection,
  togglePermission,
  togglePermissionGroup,
} from "../role-permissions";

const permission = (
  id: number,
  groupName: string | null = "系统",
  patch: Partial<PermissionResponse> = {},
): PermissionResponse => ({
  id,
  groupName,
  permissionName: `权限${id}`,
  permissionCode: `system:${id}`,
  permissionType: "BUTTON",
  enabled: true,
  description: null,
  createdAt: null,
  updatedAt: null,
  ...patch,
});

describe("角色 ID 和服务端 ID 校验", () => {
  it.each(["0", "-1", "01", "1.0", "1e2", " 1", "1 ", "Infinity", "9007199254740992", "abc"])(
    "拒绝 URL %s",
    (value) => {
      expect(parseRoleId(value)).toBeNull();
    },
  );
  it("接受正十进制安全整数", () => {
    expect(parseRoleId("1")).toBe(1);
    expect(parseRoleId(String(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "11", null])(
    "非法响应 ID %s 不可静默忽略",
    (id) => {
      expect(() => normalizePermissionIds([id as number])).toThrow("权限 ID 数据异常");
      expect(() =>
        groupPermissions([permission(id as number, "系统", { enabled: false })]),
      ).toThrow();
    },
  );
  it("集合比较去重、忽略顺序", () => {
    expect(normalizePermissionIds([12, 11, 11])).toEqual([11, 12]);
    expect(samePermissionIds([12, 11], [11, 12, 11])).toBe(true);
    expect(samePermissionIds([11], [12])).toBe(false);
  });
});

describe("扁平权限转展示分组", () => {
  it("trim 分组、稳定顺序、重复 ID 去重、缺省组与真实未分组不撞 key", () => {
    const groups = groupPermissions([
      permission(11, " 系统 "),
      permission(12, null),
      permission(13, "未分组"),
      permission(14, "系统"),
      permission(15, "  "),
      permission(11, "其他"),
    ]);
    expect(groups.map((group) => group.name)).toEqual(["系统", "未分组", "未分组"]);
    expect(groups.map((group) => group.key)).toEqual([
      "group:name:%E7%B3%BB%E7%BB%9F",
      "group:ungrouped",
      "group:name:%E6%9C%AA%E5%88%86%E7%BB%84",
    ]);
    expect(groups.map((group) => group.children.map((p) => p.id))).toEqual([
      [11, 14],
      [12, 15],
      [13],
    ]);
  });
  it("false/null enabled 防御过滤，未知 type 保留真实字段", () => {
    const groups = groupPermissions([
      permission(11),
      permission(12, null, { enabled: false }),
      permission(13, null, { enabled: null }),
      permission(14, "系统", { permissionType: "CUSTOM" }),
    ]);
    expect(groups[0].children.map((p) => p.id)).toEqual([11, 14]);
    expect(groups[0].children[1]).toMatchObject({
      permissionName: "权限14",
      permissionCode: "system:14",
      permissionType: "CUSTOM",
    });
    expect(groups[0].children[1]).not.toHaveProperty("children");
  });
  it("成功空列表保持为空，不构造可提交父节点", () => {
    expect(groupPermissions([])).toEqual([]);
  });
});

describe("三态切换和全量替换快照", () => {
  const groups = groupPermissions([
    permission(11, "系统", { permissionType: "MENU" }),
    permission(12),
  ]);
  const group = groups[0];
  it("零选、部分选、全选；mixed 点击全选、checked 点击清空", () => {
    expect(groupCheckState(group, [])).toBe("unchecked");
    expect(groupCheckState(group, [11])).toBe("mixed");
    expect(groupCheckState(group, [11, 12])).toBe("checked");
    expect(togglePermissionGroup([11], group)).toEqual([11, 12]);
    expect(togglePermissionGroup([11, 12], group)).toEqual([]);
    expect(togglePermissionGroup([], group)).toEqual([11, 12]);
  });
  it("叶动作重新派生组态；BUTTON 不自动授予 MENU", () => {
    const selected = togglePermission([], 12);
    expect(selected).toEqual([12]);
    expect(groupCheckState(group, selected)).toBe("mixed");
    expect(togglePermission(selected, 12)).toEqual([]);
    expect(
      serializePermissionSelection({ ...createPermissionSnapshot(groups, []), selected }),
    ).toEqual([12]);
  });
  it("单叶组只有两态", () => {
    const single = groupPermissions([permission(11)])[0];
    expect(groupCheckState(single, [])).toBe("unchecked");
    expect(groupCheckState(single, [11])).toBe("checked");
  });
  it("初次回显与 dirty 基线；修改再改回为 clean", () => {
    const snapshot = createPermissionSnapshot(groups, [11, 11]);
    expect(groupCheckState(group, snapshot.selected)).toBe("mixed");
    expect(permissionSnapshotDirty(snapshot)).toBe(false);
    expect(permissionSnapshotDirty({ ...snapshot, selected: [12] })).toBe(true);
    expect(permissionSnapshotDirty({ ...snapshot, selected: [11] })).toBe(false);
    expect(permissionSnapshotDirty(null)).toBe(false);
  });
  it("保留 H；重置仅清空 V；提交去重排序且不含分组 key", () => {
    const snapshot = createPermissionSnapshot(groups, [99, 11, 99]);
    expect(snapshot.hidden).toEqual([99]);
    expect(serializePermissionSelection({ ...snapshot, selected: [12, 11] })).toEqual([11, 12, 99]);
    expect(serializePermissionSelection({ ...snapshot, selected: [] })).toEqual([99]);
    expect(permissionSnapshotDirty({ ...snapshot, selected: [] })).toBe(true);
    expect(
      serializePermissionSelection({ ...createPermissionSnapshot(groups, [11]), selected: [] }),
    ).toEqual([]);
  });
  it("不可见选择不能冒充可编辑叶；后台数据不改变已锁快照", () => {
    const snapshot = createPermissionSnapshot(groups, [11, 99]);
    expect(() => serializePermissionSelection({ ...snapshot, selected: [88] })).toThrow();
    groupPermissions([permission(22)]);
    expect(snapshot.visible).toEqual([11, 12]);
    expect(snapshot.baseline).toEqual([11, 99]);
  });
  it("最新候选禁用或删除新选择时剔除，保留仍有效的新选择和已有分配", () => {
    const snapshot = createPermissionSnapshot(
      groupPermissions([permission(11), permission(12), permission(13), permission(14)]),
      [11, 99],
    );
    const latestVisible = groupPermissions([
      permission(11, "系统", { enabled: false }),
      permission(12, "系统", { enabled: false }),
      permission(14),
    ]).flatMap((group) => group.children.map((p) => p.id));
    const selected = filterMissingNewPermissionIds([11, 12, 13, 14], snapshot.baseline, latestVisible);
    expect(selected).toEqual([11, 14]);
    expect(serializePermissionSelection({ ...snapshot, selected })).toEqual([11, 14, 99]);
    expect(snapshot.selected).toEqual([11]);
  });
  it("过滤后仍含快照外的有效 ID 时序列化继续拒绝", () => {
    const snapshot = createPermissionSnapshot(groups, []);
    const selected = filterMissingNewPermissionIds([88], snapshot.baseline, [88]);
    expect(() => serializePermissionSelection({ ...snapshot, selected })).toThrow(
      "选择包含不在编辑快照中的权限",
    );
  });
  it("保存后的实际回显创建新的干净基线，之后编辑重新变脏", () => {
    const actual = createPermissionSnapshot(groups, [12, 99]);
    expect(permissionSnapshotDirty(actual)).toBe(false);
    expect(permissionSnapshotDirty({ ...actual, selected: [] })).toBe(true);
  });
});
