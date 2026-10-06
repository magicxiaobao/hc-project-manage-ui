import { describe, expect, it } from "vitest";
import { resolvePostLoginTarget } from "../auth/login-redirect";

describe("resolvePostLoginTarget", () => {
  it("接受站内相对路径", () => {
    expect(resolvePostLoginTarget("/sys/users")).toBe("/sys/users");
    expect(resolvePostLoginTarget("/sys/users?tab=roles")).toBe("/sys/users?tab=roles");
    expect(resolvePostLoginTarget("/")).toBe("/");
  });

  it("丢弃外部 URL 与协议相对 URL（防 open redirect）", () => {
    expect(resolvePostLoginTarget("https://evil.example/login")).toBeUndefined();
    expect(resolvePostLoginTarget("//evil.example/sys/users")).toBeUndefined();
    expect(resolvePostLoginTarget("javascript:alert(1)")).toBeUndefined();
  });

  it("丢弃非字符串与缺省值", () => {
    expect(resolvePostLoginTarget(undefined)).toBeUndefined();
    expect(resolvePostLoginTarget(null)).toBeUndefined();
    expect(resolvePostLoginTarget(42)).toBeUndefined();
    expect(resolvePostLoginTarget("")).toBeUndefined();
  });
});
