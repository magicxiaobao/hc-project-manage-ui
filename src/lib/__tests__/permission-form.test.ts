import { describe, expect, it, vi } from "vitest";
import { ApiBusinessError } from "../api/client";
import type { PermissionResponse } from "../api/system-types";
import {
  buildPermissionCreatePayload,
  buildPermissionUpdatePayload,
  decidePermissionPrecheckFailure,
  decidePermissionSubmitFailure,
  emptyPermissionFilters,
  emptyPermissionFormInput,
  filterPermissionsLocal,
  formatPermissionTime,
  isPermissionCodeTaken,
  paginatePermissions,
  PERMISSION_TYPES,
  permissionActionCopy,
  permissionFormInputFromResponse,
  permissionFormSnapshot,
  permissionGroupLabel,
  permissionStatusLabel,
  permissionText,
  permissionTypeLabel,
  readAllPermissionPages,
  rebasePermissionFormOnVersionConflict,
  validatePermissionFormInput,
} from "../permission-form";
import { decideSubmitProceed, SubmitSessionGuard } from "../user-form";

const row = (id: number): PermissionResponse => ({
  id,
  permissionName: "权限",
  permissionCode: `code:${id}`,
  permissionType: "MENU",
  groupName: "系统",
  description: null,
  enabled: true,
  createdAt: null,
  updatedAt: 1767225600,
});
const valid = {
  ...emptyPermissionFormInput(),
  permissionName: "权限",
  permissionCode: "sys:view",
  permissionType: "MENU",
};
const page = (list: PermissionResponse[], pageNumber: number, pageSize = 100) => ({
  list,
  pageNumber,
  pageSize,
  total: 999,
});

describe("权限表单六字段", () => {
  it("新建默认启用，全部必填一次报错", () => {
    expect(emptyPermissionFormInput().enabled).toBe(true);
    expect(validatePermissionFormInput(emptyPermissionFormInput())).toEqual([
      { field: "permissionName", message: "请输入权限名称" },
      { field: "permissionCode", message: "请输入权限编码" },
      { field: "permissionType", message: "请选择权限类型" },
    ]);
  });
  it.each(PERMISSION_TYPES)("$id 为支持类型", ({ id }) => {
    expect(validatePermissionFormInput({ ...valid, permissionType: id })).toEqual([]);
  });
  it("未知类型不会改为 MENU", () => {
    const form = permissionFormInputFromResponse({ ...row(1), permissionType: "CUSTOM" });
    expect(form.permissionType).toBe("CUSTOM");
    expect(validatePermissionFormInput(form)).toEqual([
      { field: "permissionType", message: "请选择支持的权限类型" },
    ]);
  });
  it("trim 后长度边界，描述保留正文换行并校验原长度", () => {
    const boundary = {
      ...valid,
      permissionName: ` ${"名".repeat(100)} `,
      permissionCode: ` ${"c".repeat(100)} `,
      groupName: ` ${"组".repeat(100)} `,
      description: "d".repeat(500),
    };
    expect(validatePermissionFormInput(boundary)).toEqual([]);
    expect(
      validatePermissionFormInput({
        ...boundary,
        permissionName: "n".repeat(101),
        permissionCode: "c".repeat(101),
        groupName: "g".repeat(101),
        description: "d".repeat(501),
      }).map((error) => error.field),
    ).toEqual(["permissionName", "permissionCode", "groupName", "description"]);
    expect(
      validatePermissionFormInput({ ...valid, permissionName: " ", permissionCode: "\t" }).map(
        (error) => error.field,
      ),
    ).toEqual(["permissionName", "permissionCode"]);
  });
  it("六字段载荷 trim 文本，清空为空字符串，不发送 null 清空", () => {
    const input = {
      ...valid,
      permissionName: " 权限 ",
      permissionCode: " sys:view ",
      groupName: " ",
      description: "",
      enabled: false,
    };
    expect(buildPermissionCreatePayload(input)).toEqual({
      permissionName: "权限",
      permissionCode: "sys:view",
      permissionType: "MENU",
      groupName: "",
      description: "",
      enabled: false,
    });
    expect(buildPermissionUpdatePayload(8, input)).toEqual({
      id: 8,
      ...buildPermissionCreatePayload(input),
    });
    expect(
      buildPermissionUpdatePayload(8, { ...valid, description: " 第一行\n第二行 " }).description,
    ).toBe(" 第一行\n第二行 ");
  });
  it.each([true, false, null])("回填 enabled=%s 忠实保留", (enabled) => {
    const form = permissionFormInputFromResponse({
      ...row(1),
      permissionName: null,
      permissionCode: null,
      groupName: null,
      description: null,
      enabled,
    });
    expect(form).toEqual({
      permissionName: "",
      permissionCode: "",
      permissionType: "MENU",
      groupName: "",
      description: "",
      enabled,
    });
    expect(buildPermissionUpdatePayload(1, form).enabled).toBe(enabled);
  });
  it.each([
    "permissionName",
    "permissionCode",
    "permissionType",
    "groupName",
    "description",
    "enabled",
  ] as const)("%s 修改与改回都参与 dirty，输入期不 trim", (field) => {
    const changed = { ...valid, [field]: field === "enabled" ? false : `${valid[field]} ` };
    expect(permissionFormSnapshot(changed)).not.toBe(permissionFormSnapshot(valid));
    expect(permissionFormSnapshot({ ...changed, [field]: valid[field] })).toBe(
      permissionFormSnapshot(valid),
    );
  });
  it("版本变化保留用户改动，同步未改字段，并保留 null 状态", () => {
    const server = {
      ...valid,
      permissionName: "最新名",
      description: "最新描述",
      groupName: "新组",
      enabled: null,
    };
    expect(
      rebasePermissionFormOnVersionConflict({
        baseline: valid,
        current: { ...valid, description: "草稿" },
        server,
      }),
    ).toEqual({ ...server, description: "草稿" });
  });
  it("旧会话、旧详情版本均中止提交", () => {
    const guard = new SubmitSessionGuard();
    const a = guard.begin();
    guard.invalidate();
    const b = guard.begin();
    expect(guard.isCurrent(a)).toBe(false);
    expect(guard.isCurrent(b)).toBe(true);
    expect(
      decideSubmitProceed({ sessionStale: false, submittedVersion: 1, currentVersion: 2 }),
    ).toBe("abort-detail-version-changed");
    expect(
      decideSubmitProceed({ sessionStale: true, submittedVersion: 1, currentVersion: 1 }),
    ).toBe("abort-session-stale");
  });
});

describe("完整分页传输", () => {
  it.each([0, 100, 101, 201])("%i 条完整读取；整页后额外读空页", async (length) => {
    const rows = Array.from({ length }, (_, i) => row(i + 1));
    const fetch = vi.fn(async (request: { page: number; pageSize: number; bean: object }) =>
      page(rows.slice((request.page - 1) * 100, request.page * 100), request.page),
    );
    const all = await readAllPermissionPages(fetch);
    expect(all).toEqual(rows);
    expect(fetch).toHaveBeenCalledTimes(Math.floor(length / 100) + 1);
    fetch.mock.calls.forEach(([request], index) =>
      expect(request).toEqual({ page: index + 1, pageSize: 100, bean: {} }),
    );
    if (length === 201)
      expect(
        filterPermissionsLocal(all, {
          permissionCode: "code:201",
          permissionType: "",
          groupName: "",
        }),
      ).toEqual([row(201)]);
  });
  it("实际 pageSize 小于100时继续读取，按 id 去重升序", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row(4), row(2)], 1, 2))
      .mockResolvedValueOnce(page([row(2), row(3)], 2, 2))
      .mockResolvedValueOnce(page([row(1)], 3, 2));
    expect((await readAllPermissionPages(fetch)).map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("任何页失败不返回部分成功", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row(1)], 1, 1))
      .mockRejectedValueOnce(new Error("网络失败"));
    await expect(readAllPermissionPages(fetch)).rejects.toThrow("网络失败");
  });
  it("重复页不会无限循环或静默截断", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row(1), row(2)], 1, 2))
      .mockResolvedValueOnce(page([row(2), row(1)], 2, 2));
    await expect(readAllPermissionPages(fetch)).rejects.toThrow("分页重复");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("页码不推进拒绝", async () => {
    await expect(readAllPermissionPages(vi.fn().mockResolvedValue(page([], 0)))).rejects.toThrow(
      "分页响应异常",
    );
  });
  it("满页没有任何新 id 拒绝", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row(1), row(2)], 1, 2))
      .mockResolvedValueOnce(page([row(1), row(1)], 2, 2));
    await expect(readAllPermissionPages(fetch)).rejects.toThrow("分页未推进");
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("非法 id %s 拒绝", async (id) => {
    await expect(
      readAllPermissionPages(vi.fn().mockResolvedValue(page([row(id)], 1))),
    ).rejects.toThrow("ID 数据异常");
  });
  it("响应分页大小变化拒绝，防止漏页", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([row(1)], 1, 1))
      .mockResolvedValueOnce(page([], 2, 2));
    await expect(readAllPermissionPages(fetch)).rejects.toThrow("分页大小发生变化");
  });
});

describe("筛选、分页、展示", () => {
  const rows = [
    row(1),
    { ...row(2), permissionType: "API", groupName: " CustomGroup ", permissionCode: " User:READ " },
    { ...row(3), permissionCode: null, groupName: null, permissionType: "CUSTOM" },
  ];
  it("trim、不区分大小写子串、类型精确和 AND", () => {
    expect(
      filterPermissionsLocal(rows, {
        permissionCode: " read ",
        groupName: " custom ",
        permissionType: "API",
      }),
    ).toEqual([rows[1]]);
    expect(
      filterPermissionsLocal(rows, {
        permissionCode: "read",
        groupName: "系统",
        permissionType: "API",
      }),
    ).toEqual([]);
    expect(
      filterPermissionsLocal(rows, { permissionCode: "", groupName: "", permissionType: "api" }),
    ).toEqual([]);
    expect(
      filterPermissionsLocal(rows, { ...emptyPermissionFilters(), permissionType: "CUSTOM" }),
    ).toEqual([rows[2]]);
    expect(
      filterPermissionsLocal(rows, { ...emptyPermissionFilters(), groupName: "未分组" }),
    ).toEqual([]);
    expect(filterPermissionsLocal(rows, emptyPermissionFilters())).toEqual(rows);
  });
  it("20条分页，夹紧合法页，total 是筛选后数量", () => {
    const all = Array.from({ length: 41 }, (_, i) => row(i + 1));
    expect(paginatePermissions(all, 1).rows).toHaveLength(20);
    expect(paginatePermissions(all, 9)).toEqual({
      page: 3,
      totalPages: 3,
      total: 41,
      rows: [row(41)],
    });
    expect(paginatePermissions([], 9)).toEqual({ page: 1, totalPages: 1, total: 0, rows: [] });
    expect(paginatePermissions(all, 0).page).toBe(1);
  });
  it("null、空分组、未知类型和秒级时间防御展示", () => {
    expect(permissionText(null)).toBe("—");
    expect(permissionText("  ")).toBe("—");
    expect(permissionGroupLabel(" ")).toBe("未分组");
    expect(permissionGroupLabel(null)).toBe("未分组");
    expect(permissionTypeLabel("CUSTOM")).toBe("CUSTOM");
    expect(permissionTypeLabel("API")).toBe("接口");
    expect([true, false, null].map(permissionStatusLabel)).toEqual(["启用", "禁用", "未设置"]);
    expect(formatPermissionTime(1767225600)).toContain("2026");
    expect(formatPermissionTime(null)).toBe("—");
    expect(formatPermissionTime(NaN)).toBe("—");
  });
  it("三种操作文案及删除反馈忠实于仅禁用", () => {
    expect(permissionActionCopy("valid", row(1)).message).toContain("不会自动分配给角色");
    expect(permissionActionCopy("invalid", row(1)).message).toContain("已有角色关联保留");
    expect(permissionActionCopy("delete", row(1))).toEqual({
      title: "删除权限点",
      confirm: "确定删除",
      message:
        "确定删除权限点「权限（code:1）」？当前接口会将其标记为禁用，权限记录、编码和已有角色关联仍保留。",
      success: "删除操作完成，权限点已标记为禁用",
    });
  });
});

describe("唯一性及真实错误决策", () => {
  it("精确 trim、大小写折叠、自身排除，禁用/delete记录仍占用，名称不唯一", () => {
    const rows = [{ ...row(1), permissionCode: " Code ", enabled: false }, row(2)];
    expect(isPermissionCodeTaken(rows, "code", null)).toBe(true);
    expect(isPermissionCodeTaken(rows, "code", 1)).toBe(false);
    expect(isPermissionCodeTaken(rows, "cod", null)).toBe(false);
    expect(
      validatePermissionFormInput({ ...valid, permissionName: rows[0].permissionName! }),
    ).toEqual([]);
  });
  it("只有明确预检命中才提示已存在", () => {
    expect(decidePermissionPrecheckFailure().permissionCodeError).toBe("权限编码已存在");
  });
  it.each([10002, 10003])("%s 是通用保存错误，并非专属冲突", (code) => {
    const result = decidePermissionSubmitFailure(
      new ApiBusinessError({ code, msg: "保存信息失败", result: null }, 400),
      true,
    );
    expect(result.permissionCodeError).toContain("可能已被占用，也可能是其他保存错误");
    expect(result.permissionCodeError).not.toContain("已存在");
    expect(result.clearOverall).toBe(true);
  });
  it.each([10001, 10112, 10999])("%s 中性字段提示及整体说明", (code) => {
    expect(
      decidePermissionSubmitFailure(
        new ApiBusinessError({ code, msg: "请求失败", result: null }, 500),
        false,
      ),
    ).toEqual({
      permissionCodeError: "提交失败，请检查表单后重试",
      clearOverall: false,
      overallError: "更新失败：请求失败",
    });
  });
  it("网络失败不猜编码冲突", () => {
    const result = decidePermissionSubmitFailure(new Error("fetch failed"), true);
    expect(result.permissionCodeError).toBe("提交失败，请检查表单后重试");
    expect(result.overallError).toContain("创建失败：");
    expect(result.clearOverall).toBe(false);
  });
});
