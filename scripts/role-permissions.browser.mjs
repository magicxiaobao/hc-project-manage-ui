/**
 * 真浏览器 + TanStack 文件路由 + 共享守卫，接口由 Playwright 拦截。
 * 先启动 pnpm dev，再运行：
 * P5_BROWSER_BASE_URL=http://127.0.0.1:8080 pnpm exec node scripts/role-permissions.browser.mjs
 * 不替代真实后端/重新登录授权验收。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const base = process.env.P5_BROWSER_BASE_URL ?? "http://127.0.0.1:8095";
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

const roles = Array.from({ length: 23 }, (_, i) => ({
  id: i + 1,
  roleName: `角色${i + 1}`,
  roleCode: `ROLE_${i + 1}`,
  description: `角色描述${i + 1}`,
  enabled: true,
  createdAt: null,
  updatedAt: null,
}));
const permissions = [
  {
    id: 11,
    permissionName: "查看系统",
    permissionCode: "sys:view",
    permissionType: "MENU",
    groupName: "系统",
    enabled: true,
  },
  {
    id: 12,
    permissionName: "编辑系统",
    permissionCode: "sys:edit",
    permissionType: "BUTTON",
    groupName: "系统",
    enabled: true,
  },
  {
    id: 13,
    permissionName: "其他权限",
    permissionCode: "custom:operate",
    permissionType: "CUSTOM",
    groupName: null,
    enabled: true,
  },
  {
    id: 14,
    permissionName: "禁用权限",
    permissionCode: "disabled",
    permissionType: "BUTTON",
    groupName: "系统",
    enabled: false,
  },
  {
    id: 15,
    permissionName: "空状态权限",
    permissionCode: "null-enabled",
    permissionType: "MENU",
    groupName: null,
    enabled: null,
  },
];
const button = (page, name) => page.getByRole("button", { name, exact: true });
const leaf = (page, name) => page.getByRole("checkbox", { name: new RegExp(`选择权限 ${name}`) });
const group = (page) => page.getByRole("checkbox", { name: "选择分组 系统", exact: true });
const dialog = (page) => page.getByRole("dialog", { name: "是否放弃修改？" });
async function eventually(check) {
  const deadline = Date.now() + 10_000;
  let error;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (err) {
      error = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw error;
}
async function setup(
  t,
  { path = "/sys/roles/1/permissions", authenticated = true, admin = true, viewport } = {},
) {
  const context = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 900 } });
  t.after(() => context.close());
  // 仅供网络拦截测试的假会话，绝不使用后端令牌。
  if (authenticated)
    await context.addInitScript(
      ({ admin }) => {
        localStorage.setItem("token", "test-only-access");
        localStorage.setItem("refreshToken", "test-only-refresh");
        localStorage.setItem(
          "userInfo",
          JSON.stringify({
            userId: "1",
            userName: "测试管理员",
            cnName: null,
            roles: ["TEST"],
            authorities: admin ? ["system:admin"] : [],
          }),
        );
      },
      { admin },
    );
  const state = {
    roles: [...roles],
    tree: [...permissions],
    assigned: { 1: [11, 99], 2: [12] },
    requests: [],
    posts: [],
    failPost: false,
    failGet: false,
    failTree: false,
    failRoles: false,
    mismatch: false,
    delayPost: null,
    delayRole: null,
  };
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.requests.push(`${request.method()} ${url.pathname}${url.search}`);
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    const fail = () =>
      route.fulfill({ status: 403, json: { code: 10001, msg: "测试请求失败", result: null } });
    if (url.pathname === "/api/role/v1/list") {
      if (state.failRoles) return fail();
      const keyword = url.searchParams.get("keyword");
      return ok(
        state.roles.filter(
          (role) => !keyword || role.roleName.includes(keyword) || role.roleCode.includes(keyword),
        ),
      );
    }
    if (url.pathname === "/api/permission/v1/tree") return state.failTree ? fail() : ok(state.tree);
    if (url.pathname.startsWith("/api/role/v1/permissions/")) {
      const id = Number(url.pathname.split("/").at(-1));
      if (state.delayRole?.id === id) await state.delayRole.promise;
      return state.failGet ? fail() : ok(state.assigned[id] ?? []);
    }
    if (url.pathname === "/api/role/v1/assignPermissions") {
      const payload = request.postDataJSON();
      state.posts.push(payload);
      if (state.delayPost) await state.delayPost;
      if (state.failPost) return fail();
      state.assigned[payload.roleId] = state.mismatch ? [13] : [...payload.permissionIds];
      return ok("权限分配成功");
    }
    if (url.pathname === "/api/role/v1/findByPage")
      return ok({ list: state.roles, total: state.roles.length, pageNumber: 1, pageSize: 100 });
    if (/avatar\/content$/.test(url.pathname)) return route.fulfill({ status: 404, body: "" });
    return ok([]);
  });
  await page.goto(`${base}${path}`);
  return { page, state, context };
}
async function ready(page) {
  await leaf(page, "查看系统").waitFor();
}
async function saved(page) {
  await page.getByText("权限分配成功", { exact: true }).waitFor();
  await eventually(async () => {
    assert.equal(await button(page, "重置选择").isDisabled(), false);
    assert.equal(await button(page, "保存分配").isDisabled(), true);
  });
}
async function dirty(page) {
  await ready(page);
  await leaf(page, "编辑系统").check();
}
async function reconnect(page) {
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

test("真实字段、启用过滤、mixed 组、键盘切换、展开不改变 dirty", async (t) => {
  const { page } = await setup(t);
  await ready(page);
  assert.equal(await group(page).getAttribute("aria-checked"), "mixed");
  assert.equal(await leaf(page, "禁用权限").count(), 0);
  assert.equal(await leaf(page, "空状态权限").count(), 0);
  assert.match(await page.getByLabel("当前角色权限").innerText(), /custom:operate · CUSTOM/);
  await button(page, "收起全部").click();
  await button(page, "展开全部").click();
  assert.equal(await button(page, "保存分配").isDisabled(), true);
  await group(page).focus();
  await page.keyboard.press("Space");
  assert.equal(await group(page).getAttribute("aria-checked"), "true");
  await group(page).uncheck();
  assert.equal(await group(page).getAttribute("aria-checked"), "false");
  assert.equal(await leaf(page, "查看系统").isChecked(), false);
});

test("保存保留 H，仅提交真实 ID，显式 GET 回显；重置清 V", async (t) => {
  const { page, state } = await setup(t);
  await dirty(page);
  await button(page, "保存分配").click();
  await saved(page);
  assert.deepEqual(state.posts, [{ roleId: 1, permissionIds: [11, 12, 99] }]);
  assert.ok(state.requests.filter((r) => r === "GET /api/role/v1/permissions/1").length >= 2);
  assert.match(
    await page.getByLabel("当前角色权限").innerText(),
    /已有 1 项权限不在当前可分配列表，保存时保留/,
  );
  await button(page, "重置选择").click();
  await button(page, "保存分配").click();
  await saved(page);
  assert.equal(state.posts.length, 2);
  assert.deepEqual(state.posts[1].permissionIds, [99]);
});

test("脏草稿同角色 no-op；角色切换继续编辑/关闭/Escape 保留，放弃只导航一次", async (t) => {
  const { page } = await setup(t);
  await dirty(page);
  await button(page, /^角色1\s+ROLE_1\s+角色描述1$/).click();
  assert.equal(await dialog(page).count(), 0);
  const target = page.getByRole("button", { name: /^角色2\s+ROLE_2\s+角色描述2$/, exact: true });
  await target.click();
  await dialog(page).waitFor();
  await button(page, "继续编辑").click();
  assert.equal(new URL(page.url()).pathname, "/sys/roles/1/permissions");
  assert.equal(await leaf(page, "编辑系统").isChecked(), true);
  await target.click();
  await dialog(page).waitFor();
  await page.keyboard.press("Escape");
  await eventually(async () => assert.equal(await dialog(page).count(), 0));
  await target.click();
  await dialog(page).waitFor();
  await button(page, "关闭").click();
  await target.click();
  await dialog(page).waitFor();
  await button(page, "放弃修改").click();
  await page.waitForURL("**/sys/roles/2/permissions");
  await ready(page);
  await leaf(page, "查看系统").check();
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
});

test("返回列表和侧栏链接均拦截；新编辑在成功保存后重新布防", async (t) => {
  const { page } = await setup(t);
  await dirty(page);
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
  await button(page, "继续编辑").click();
  await page.getByRole("link", { name: "个人资料", exact: true }).click();
  await dialog(page).waitFor();
  await button(page, "继续编辑").click();
  await button(page, "保存分配").click();
  await saved(page);
  await leaf(page, "编辑系统").uncheck();
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
});

test("浏览器后退/前进走真实 blocker，继续编辑保留 URL，放弃后可继续导航", async (t) => {
  const { page } = await setup(t);
  await ready(page);
  await page.getByRole("button", { name: /^角色2\s+ROLE_2\s+角色描述2$/, exact: true }).click();
  await page.waitForURL("**/sys/roles/2/permissions");
  await ready(page);
  await leaf(page, "查看系统").check();
  const back = page.goBack();
  await dialog(page).waitFor();
  await button(page, "继续编辑").click();
  await back;
  assert.equal(new URL(page.url()).pathname, "/sys/roles/2/permissions");
  const discardBack = page.goBack();
  await dialog(page).waitFor();
  await button(page, "放弃修改").click();
  await discardBack;
  await page.waitForURL("**/sys/roles/1/permissions");
  await dirty(page);
  const forward = page.goForward();
  await dialog(page).waitFor();
  await button(page, "放弃修改").click();
  await forward;
  await page.waitForURL("**/sys/roles/2/permissions");
});

test("刷新/关闭使用浏览器真实 beforeunload dialog", async (t) => {
  const { page } = await setup(t);
  await dirty(page);
  const native = page.waitForEvent("dialog");
  const reload = page.reload().catch(() => {});
  const prompt = await native;
  assert.equal(prompt.type(), "beforeunload");
  await prompt.dismiss();
  await reload;
  assert.equal(await leaf(page, "编辑系统").isChecked(), true);
  const closePrompt = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const closing = await closePrompt;
  assert.equal(closing.type(), "beforeunload");
  await closing.dismiss();
  assert.equal(page.isClosed(), false);
});

test("搜索 Enter 提交、本地分页、隐藏当前角色不丢草稿、禁用搜索结果过滤", async (t) => {
  const { page, state } = await setup(t);
  await dirty(page);
  state.roles.push({ ...roles[0], id: 100, roleName: "角色23禁用", enabled: false });
  const input = page.getByRole("textbox", { name: "搜索角色" });
  const count = state.requests.length;
  await input.fill("角色23");
  assert.equal(state.requests.length, count);
  await input.press("Enter");
  await eventually(async () =>
    assert.match(await page.getByLabel("角色列表").innerText(), /共 1 个角色/),
  );
  assert.equal(await page.getByRole("button", { name: /角色23禁用/ }).count(), 0);
  assert.match(await page.getByLabel("当前角色权限").innerText(), /角色1/);
  assert.equal(await leaf(page, "编辑系统").isChecked(), true);
  await input.fill("不匹配");
  await button(page, "搜索").click();
  await page.getByText("没有匹配的启用角色").waitFor();
  assert.equal(new URL(page.url()).pathname, "/sys/roles/1/permissions");
  await input.fill("");
  await input.press("Enter");
  await button(page, "下一页").click();
  assert.match(await page.getByLabel("角色列表").innerText(), /第 2 \/ 2 页/);
  assert.equal(await leaf(page, "编辑系统").isChecked(), true);
});

test("后台刷新不重播种；角色禁用/后台失败保留 dirty 和常驻守卫", async (t) => {
  const { page, state } = await setup(t);
  await dirty(page);
  state.assigned[1] = [13];
  await reconnect(page);
  await eventually(() =>
    assert.ok(state.requests.filter((r) => r.endsWith("/permissions/1")).length >= 2),
  );
  assert.equal(await leaf(page, "编辑系统").isChecked(), true);
  state.roles = state.roles.map((role) => (role.id === 1 ? { ...role, enabled: false } : role));
  await reconnect(page);
  await page.getByText("角色不存在或未启用").waitFor();
  assert.equal(await leaf(page, "编辑系统").isChecked(), true);
  assert.equal(await button(page, "保存分配").isDisabled(), true);
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
  await button(page, "继续编辑").click();
  state.failRoles = true;
  await reconnect(page);
  await page.getByText(/完整角色列表加载失败/).waitFor();
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
});

test("主动重载先确认，加载新快照后新编辑重新布防", async (t) => {
  const { page, state } = await setup(t);
  await dirty(page);
  state.assigned[1] = [13];
  await button(page, "重新加载").click();
  await dialog(page).waitFor();
  await button(page, "继续编辑").click();
  assert.equal(await leaf(page, "编辑系统").isChecked(), true);
  await button(page, "重新加载").click();
  await dialog(page).waitFor();
  await button(page, "放弃修改").click();
  await eventually(async () => assert.equal(await leaf(page, "其他权限").isChecked(), true));
  await leaf(page, "编辑系统").check();
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
});

test("POST 失败保留草稿，编辑即清字段错误；在途只提交一次并禁用控件", async (t) => {
  const { page, state } = await setup(t);
  await dirty(page);
  let resolve;
  state.delayPost = new Promise((r) => {
    resolve = r;
  });
  state.failPost = true;
  await button(page, "保存分配").dblclick();
  await eventually(() => assert.equal(state.posts.length, 1));
  assert.equal(await leaf(page, "编辑系统").isDisabled(), true);
  assert.equal(await button(page, "重置选择").isDisabled(), true);
  assert.equal(
    await page
      .getByRole("button", { name: /^角色2\s+ROLE_2\s+角色描述2$/, exact: true })
      .isDisabled(),
    true,
  );
  resolve();
  await page.getByText(/保存失败：/).waitFor();
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
  await button(page, "继续编辑").click();
  await leaf(page, "其他权限").check();
  assert.equal(await page.getByText(/保存失败：/).count(), 0);
});

test("POST 成功 GET 失败显示两种结果，重试回显成功；不匹配显示实际选择", async (t) => {
  const { page, state } = await setup(t);
  await dirty(page);
  state.failGet = true;
  await button(page, "保存分配").click();
  await page.getByText("权限分配成功", { exact: true }).waitFor();
  await page.getByText(/保存已成功，回显验证失败，请重试/).waitFor();
  assert.equal(await page.getByText(/保存失败：/).count(), 0);
  state.failGet = false;
  await button(page, "重试回显验证").click();
  await eventually(async () => assert.equal(await page.getByText(/回显验证失败/).count(), 0));
  await leaf(page, "其他权限").check();
  state.mismatch = true;
  await button(page, "保存分配").click();
  await page.getByText("已保存权限与本次提交不一致，请核对").waitFor();
  assert.equal(await leaf(page, "其他权限").isChecked(), true);
  assert.equal(await leaf(page, "查看系统").isChecked(), false);
  assert.equal(await leaf(page, "编辑系统").isChecked(), false);
});

test("已确认离开后旧 POST 回调不能修改新角色", async (t) => {
  const { page, state } = await setup(t);
  await ready(page);
  await page.getByRole("button", { name: /^角色2\s+ROLE_2\s+角色描述2$/, exact: true }).click();
  await page.waitForURL("**/sys/roles/2/permissions");
  await ready(page);
  await leaf(page, "查看系统").check();
  let resolve;
  state.delayPost = new Promise((r) => {
    resolve = r;
  });
  await button(page, "保存分配").click();
  await eventually(() => assert.equal(state.posts.length, 1));
  const back = page.goBack();
  await dialog(page).waitFor();
  await button(page, "放弃修改").click();
  await back;
  await page.waitForURL("**/sys/roles/1/permissions");
  await dirty(page);
  resolve();
  await eventually(async () => assert.equal(await button(page, "保存分配").isDisabled(), false));
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
});

test("保存在途后退保留待决确认，POST 失败不会令导航挂起", async (t) => {
  const { page, state } = await setup(t);
  await ready(page);
  await page.getByRole("button", { name: /^角色2\s+ROLE_2\s+角色描述2$/, exact: true }).click();
  await page.waitForURL("**/sys/roles/2/permissions");
  await ready(page);
  await leaf(page, "查看系统").check();
  let resolve;
  state.delayPost = new Promise((r) => {
    resolve = r;
  });
  state.failPost = true;
  await button(page, "保存分配").click();
  const back = page.goBack();
  await dialog(page).waitFor();
  resolve();
  await page.getByText(/保存失败：/).waitFor();
  await button(page, "继续编辑").click();
  await back;
  assert.equal(new URL(page.url()).pathname, "/sys/roles/2/permissions");
});

test("空树、非法响应 ID、失败 GET 不初始化空草稿，均可重试", async (t) => {
  const { page, state } = await setup(t);
  await ready(page);
  state.tree = [];
  await button(page, "重新加载").click();
  await page.getByText("暂未取得可分配权限，请重试").waitFor();
  assert.equal(await button(page, "保存分配").isDisabled(), true);
  state.tree = [{ ...permissions[0], id: 0 }];
  await button(page, "重新加载").click();
  await page
    .getByText(/权限 ID 数据异常/)
    .first()
    .waitFor();
  assert.equal(await button(page, "保存分配").isDisabled(), true);
  state.tree = permissions;
  state.failGet = true;
  await button(page, "重新加载").click();
  await page.getByText(/权限加载失败/).waitFor();
  assert.equal(await leaf(page, "查看系统").count(), 0);
  state.failGet = false;
  await button(page, "重试权限加载").click();
  await ready(page);
});

test("非法 URL 不请求；角色不存在/禁用无编辑；列表入口禁用角色不可用", async (t) => {
  const { page, state } = await setup(t, { path: "/sys/roles/01/permissions" });
  await page.getByText(/角色 ID 无效/).waitFor();
  assert.equal(
    state.requests.filter((r) => /role\/v1\/permissions|permission\/v1\/tree/.test(r)).length,
    0,
  );
  state.roles[0] = { ...state.roles[0], enabled: false };
  await button(page, "返回角色列表").click();
  await page.waitForURL("**/sys/roles");
  await eventually(async () =>
    assert.equal(await button(page, "分配权限").first().isDisabled(), true),
  );
  await button(page, "分配权限").nth(1).click();
  await page.waitForURL("**/permissions");
  await ready(page);
  await page.goto(`${base}/sys/roles/999/permissions`);
  await page.getByText("角色不存在或未启用").waitFor();
  assert.equal(await button(page, "保存分配").isDisabled(), true);
});

test("未登录/非管理员路由跳转，不请求权限域", async (t) => {
  for (const auth of [{ authenticated: false }, { authenticated: true, admin: false }]) {
    const { page, state } = await setup(t, auth);
    await page.waitForURL(auth.authenticated ? "**/projects" : "**/login?**");
    assert.equal(
      state.requests.filter((r) => /role\/v1\/permissions|permission\/v1\/tree/.test(r)).length,
      0,
    );
  }
});

test("窄屏上下排列、复选框与展开控件具可访问状态，无横向溢出", async (t) => {
  const { page } = await setup(t, { viewport: { width: 390, height: 844 } });
  await ready(page);
  const left = await page.getByLabel("角色列表").boundingBox();
  const right = await page.getByLabel("当前角色权限").boundingBox();
  assert.ok(right.y >= left.y + left.height);
  const toggle = button(page, "收起分组 系统");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await toggle.click();
  assert.equal(await button(page, "展开分组 系统").getAttribute("aria-expanded"), "false");
  assert.equal(await group(page).getAttribute("aria-checked"), "mixed");
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
  );
});

test("后台 A 请求迟到不污染 B 的选择或 dirty", async (t) => {
  const { page, state } = await setup(t);
  await ready(page);
  let resolve;
  state.delayRole = {
    id: 1,
    promise: new Promise((r) => {
      resolve = r;
    }),
  };
  state.assigned[1] = [13];
  await reconnect(page);
  await eventually(() =>
    assert.ok(state.requests.filter((r) => r.endsWith("/permissions/1")).length >= 2),
  );
  await page.getByRole("button", { name: /^角色2\s+ROLE_2\s+角色描述2$/, exact: true }).click();
  await page.waitForURL("**/sys/roles/2/permissions");
  await ready(page);
  await leaf(page, "查看系统").check();
  resolve();
  await eventually(async () => {
    assert.equal(await leaf(page, "编辑系统").isChecked(), true);
    assert.equal(await leaf(page, "其他权限").isChecked(), false);
    assert.equal(await button(page, "保存分配").isDisabled(), false);
  });
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
});

test("保存在途后退待决确认在 POST 成功后仍可完成导航", async (t) => {
  const { page, state } = await setup(t);
  await ready(page);
  await page.getByRole("button", { name: /^角色2\s+ROLE_2\s+角色描述2$/, exact: true }).click();
  await page.waitForURL("**/sys/roles/2/permissions");
  await ready(page);
  await leaf(page, "查看系统").check();
  let resolve;
  state.delayPost = new Promise((r) => {
    resolve = r;
  });
  await button(page, "保存分配").click();
  await eventually(() => assert.equal(state.posts.length, 1));
  const back = page.goBack();
  await dialog(page).waitFor();
  resolve();
  await page.getByText("权限分配成功", { exact: true }).waitFor();
  await button(page, "放弃修改").click();
  await back;
  await page.waitForURL("**/sys/roles/1/permissions");
  await dirty(page);
  await button(page, "返回角色列表").click();
  await dialog(page).waitFor();
});
