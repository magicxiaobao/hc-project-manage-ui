import { describe, expect, it } from "vitest";
import {
  bindMapping,
  constraintsMatch,
  mapMenuPath,
  matchPage,
  normalizeInternalPath,
} from "../route-manifest";

describe("normalizeInternalPath", () => {
  it("统一尾斜杠并剥离 query/hash", () => {
    expect(normalizeInternalPath("/sys/users/?a=1#x")).toBe("/sys/users");
    expect(normalizeInternalPath("/")).toBe("/");
  });
  it("拒绝路径穿越、编码斜杠与非法字符", () => {
    expect(normalizeInternalPath("/sys/../admin")).toBeNull();
    expect(normalizeInternalPath("/sys/%2fadmin")).toBeNull();
    expect(normalizeInternalPath("/sys/%5cadmin")).toBeNull();
    expect(normalizeInternalPath("/sys//users")).toBeNull();
    expect(normalizeInternalPath("https://evil.example/x")).toBeNull();
    expect(normalizeInternalPath("/sys/us ers")).toBeNull();
  });
});

describe("matchPage", () => {
  it("具体静态路径优先于参数路径", () => {
    const hit = matchPage("/sys/users/new");
    expect(hit?.page.route).toBe("/sys/users/new");
  });
  it("参数路径解析出参数", () => {
    const hit = matchPage("/sys/users/42/roles");
    expect(hit?.page.route).toBe("/sys/users/$userId/roles");
    expect(hit?.params).toEqual({ userId: "42" });
  });
  it("拒绝把参数占位符当字面量", () => {
    expect(matchPage("/sys/users/$userId/roles")).toBeNull();
  });
  it("未知 URL 返回 null（走 404）", () => {
    expect(matchPage("/no/such/page")).toBeNull();
  });
  it("仅登录策略的页面可匹配", () => {
    expect(matchPage("/me")?.page.policy).toBe("authenticated");
  });
});

describe("mapMenuPath", () => {
  it("老 sys 别名映射到已实现页面", () => {
    expect(mapMenuPath("/system/user")?.page.route).toBe("/sys/users/");
    expect(mapMenuPath("/system/role")?.page.route).toBe("/sys/roles/");
    expect(mapMenuPath("/system/menu")?.page.route).toBe("/sys/menus/");
    expect(mapMenuPath("/system/dictionary")?.page.route).toBe("/sys/dictionaries/");
    expect(mapMenuPath("/system/permission")?.page.route).toBe("/sys/permissions/");
  });
  it("别名不创建第二份生效 URL（matchPage 认不出别名）", () => {
    expect(matchPage("/system/user")).toBeNull();
  });
  it("模板菜单绑定固定参数约束", () => {
    const mapping = mapMenuPath("/p/HC/requirements");
    expect(mapping?.page.route).toBe("/p/$projectKey/requirements/");
    expect(mapping?.constraints).toEqual({ projectKey: "HC" });
    expect(constraintsMatch(mapping!, { projectKey: "HC" })).toBe(true);
    expect(constraintsMatch(mapping!, { projectKey: "OTHER" })).toBe(false);
  });
  it("bindMapping 用约束回填参数；约束冲突返回 null", () => {
    const mapping = mapMenuPath("/p/HC/requirements")!;
    expect(bindMapping(mapping)).toBe("/p/HC/requirements");
    expect(bindMapping(mapping, { projectKey: "OTHER" })).toBeNull();
  });
  it("无参数上下文不生成项目链接", () => {
    const mapping = mapMenuPath("/p/$projectKey/issues");
    expect(mapping?.page.route).toBe("/p/$projectKey/issues/");
    expect(bindMapping(mapping!)).toBeNull();
    expect(bindMapping(mapping!, { projectKey: "HC" })).toBe("/p/HC/issues");
  });
  it("未知 path/uri 隔离为 null", () => {
    expect(mapMenuPath("/sys/system-configs")).toBeNull();
    expect(mapMenuPath("/whatever")).toBeNull();
  });
});

it('workflow designer alias maps a menu but never creates an old URL route', () => {
  expect(mapMenuPath('/system/workflow-designer')?.page.route).toBe('/sys/workflow-designer');
  expect(matchPage('/system/workflow-designer')).toBeNull();
  expect(matchPage('/sys/workflow-designer')?.page).toMatchObject({ title: '工作流设计器', policy: 'menu' });
});
