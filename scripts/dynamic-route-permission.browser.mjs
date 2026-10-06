/**
 * Frontend fixture acceptance only. Every /api response is intercepted; no real
 * backend grant, filtered tree, cache eviction, or administrator token is claimed.
 * Run against dev or preview: P5_BROWSER_BASE_URL=http://127.0.0.1:8080
 * pnpm exec node --test scripts/dynamic-route-permission.browser.mjs
 * The credential bootstrap uses the fixture login response and reloads the SPA;
 * the existing login form itself belongs to the pre-existing HeroUI migration.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const base = process.env.P5_BROWSER_BASE_URL ?? "http://127.0.0.1:8080";
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});
after(async () => {
  await browser?.close();
});
async function eventually(check) {
  const end = Date.now() + 15_000;
  let error;
  while (Date.now() < end) {
    try {
      await check();
      return;
    } catch (caught) {
      error = caught;
    }
    await new Promise((done) => setTimeout(done, 40));
  }
  throw error;
}
async function setup(t, { mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 },
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const state = {
    authorities: ["users:view"],
    userId: "7",
    failMenus: false,
    calls: [],
    logins: 0,
  };
  const user = () => ({
    userId: state.userId,
    userName: "fixture",
    cnName: null,
    extraInfo: {},
    roles: ["admin"],
    authorities: [...state.authorities],
  });
  const menu = (id, extra) => ({
    id,
    parentId: null,
    name: `菜单${id}`,
    type: 2,
    icon: null,
    path: null,
    openType: 1,
    uri: null,
    permission: "users:view",
    sort: 0,
    hidden: false,
    keepAlive: null,
    memo: null,
    createdAt: null,
    updatedAt: null,
    ...extra,
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    state.calls.push({ path: url.pathname, search: url.search, method: request.method() });
    let result;
    if (url.pathname === "/api/auth/v1/login")
      result = {
        token: `fixture-${++state.logins}`,
        refreshToken: `fixture-refresh-${state.logins}`,
        expireSec: 3600,
        refreshExpire: 7200,
        userInfo: user(),
      };
    else if (url.pathname === "/api/auth/v1/me") result = user();
    else if (url.pathname === "/api/menu/v1/getMenuTreeByUser") {
      assert.equal(url.searchParams.get("userId"), state.userId);
      assert.equal(request.headers().token, `fixture-${state.logins}`);
      if (state.failMenus)
        return route.fulfill({ status: 503, json: { code: 500, msg: "offline", result: null } });
      result = [
        menu(1, { type: 1, name: "系统", permission: null }),
        menu(2, { parentId: 1, name: "授权用户", path: "/sys/users" }),
        menu(3, {
          parentId: 2,
          name: "按钮定义",
          type: 3,
          path: "/sys/users/new",
          permission: "users:add",
        }),
        menu(4, {
          parentId: 1,
          name: "隐藏权限页",
          path: "/sys/permissions",
          hidden: true,
          permission: "permissions:view",
        }),
      ];
    } else if (url.pathname === "/api/role/v1/assignPermissions") {
      const body = request.postDataJSON();
      assert.deepEqual(body, { roleId: 12, permissionIds: state.grant ? [91] : [] });
      state.authorities = state.grant ? ["users:view"] : [];
      result = "权限分配成功";
    } else if (url.pathname === "/api/auth/v1/logout") result = null;
    else
      return route.fulfill({
        status: 403,
        json: { code: 10011, msg: "该操作需要系统管理员权限", result: null },
      });
    await route.fulfill({ json: { code: 1, msg: "ok", result } });
  });
  await page.goto(`${base}/403`);
  // Exercise fixture login HTTP and its actual response shape, then cold-start
  // using the same three-key credentials as the existing auth store.
  async function login(path = "/") {
    await page.evaluate(async () => {
      const response = await fetch("/api/auth/v1/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "fixture", password: "fixture" }),
      });
      const { result } = await response.json();
      localStorage.setItem("token", result.token);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("userInfo", JSON.stringify(result.userInfo));
    });
    await page.goto(`${base}${path}`);
  }
  return { page, state, login };
}
test("冷启动无权深链 → 403，拒绝页面 API 未执行，SSR 不输出业务内容", async (t) => {
  const { page, state, login } = await setup(t);
  state.authorities = [];
  await login("/sys/users/123/roles");
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/403"));
  assert.equal(await page.getByRole("heading", { name: "无权访问此页面" }).count(), 1);
  assert.equal(state.calls.filter((call) => call.path.startsWith("/api/user/")).length, 0);
  const response = await page.request.get(`${base}/sys/users/123/roles`);
  const html = await response.text();
  assert.ok(!html.includes("当前用户角色"));
  assert.ok(!html.includes("角色分配表单"));
});
test("桌面导航、隐藏深链、按钮不进导航，普通 sys 授权与管理员 API 分开", async (t) => {
  const { page, state, login } = await setup(t);
  await login();
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/sys/users"));
  assert.equal(
    await page
      .getByRole("navigation", { name: "权限导航" })
      .getByRole("link", { name: "授权用户" })
      .count(),
    1,
  );
  assert.equal(await page.getByText("按钮定义", { exact: true }).count(), 0);
  assert.equal(await page.getByText("隐藏权限页", { exact: true }).count(), 0);
  assert.ok((await page.locator("main").innerText()).includes("该操作需要系统管理员权限"));
  assert.equal(state.calls.filter((call) => call.path.startsWith("/api/user/")).length, 0);
  state.authorities = ["permissions:view"];
  await login("/sys/permissions");
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/sys/permissions"));
  await page.goto(`${base}/sys/users`);
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/403"));
});
test("移动导航使用同树，点击后关闭", async (t) => {
  const { page, login } = await setup(t, { mobile: true });
  await login();
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/sys/users"));
  await page.getByRole("button", { name: "打开导航", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "项目导航", exact: true });
  await dialog.getByRole("link", { name: "授权用户", exact: true }).click();
  await eventually(async () => assert.equal(await dialog.count(), 0));
});
test("Permission ID 分配/回收后重登立即更改 landing、导航和深链", async (t) => {
  const { page, state, login } = await setup(t);
  state.authorities = [];
  await login();
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/403"));
  for (const grant of [true, false]) {
    state.grant = grant;
    await page.evaluate(async (grant) => {
      await fetch("/api/role/v1/assignPermissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: 12, permissionIds: grant ? [91] : [] }),
      });
      localStorage.clear();
    }, grant);
    await login("/sys/users");
    await eventually(() =>
      assert.equal(new URL(page.url()).pathname, grant ? "/sys/users" : "/403"),
    );
  }
});
test("聚焦撤销退出当前页；刷新错误停止旧授权，恢复可见重试", async (t) => {
  const { page, state, login } = await setup(t);
  await login();
  state.failMenus = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await eventually(async () =>
    assert.ok((await page.locator("body").innerText()).includes("权限信息加载失败")),
  );
  state.failMenus = false;
  state.authorities = [];
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/403"));
  assert.equal(await page.getByRole("link", { name: "授权用户", exact: true }).count(), 0);
});
test("登出后后退和深链不能恢复业务页；换账号不复用菜单", async (t) => {
  const { page, state, login } = await setup(t);
  await login();
  await page.evaluate(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/login"));
  await page.goto(`${base}/sys/users`);
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/login"));
  state.userId = "8";
  state.authorities = [];
  await login("/sys/users");
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/403"));
  assert.equal(await page.getByRole("link", { name: "授权用户", exact: true }).count(), 0);
});
