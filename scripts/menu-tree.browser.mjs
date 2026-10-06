/**
 * Standby browser acceptance, following permission-list.browser.mjs (node:test + Playwright).
 * NOT executed for this task. Fixture checks are frontend behavior only, never backend integration.
 * Fixture mode: P5_BROWSER_BASE_URL=http://127.0.0.1:8080 node scripts/menu-tree.browser.mjs
 * Live mode (no interception): P5_MENU_LIVE=1, P5_MENU_AUTH_JSON={token,refreshToken,userInfo},
 * P5_MENU_USER_IDS=ID_A,ID_B. Only paths/methods/response bodies are recorded, never tokens.
 * Live-created records use an identifiable prefix and are finally disabled; no deletion exists.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
const base = process.env.P5_BROWSER_BASE_URL ?? "http://127.0.0.1:8080";
const live = process.env.P5_MENU_LIVE === "1";
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
const fixture = (name, fn) => test(name, { skip: live }, fn);
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const form = (page, edit = false) =>
  page.getByRole("dialog", { name: edit ? "编辑菜单" : "新增菜单", exact: true });
const discard = (page) => page.getByRole("dialog", { name: "是否放弃修改？", exact: true });
const recordRow = (page, id = 1) =>
  page
    .getByRole("table", { name: "菜单管理树" })
    .getByRole("row")
    .filter({ has: page.getByText(`#${id}`, { exact: true }) });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function eventually(check) {
  const deadline = Date.now() + 15000;
  let error;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (caught) {
      error = caught;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw error;
}
async function select(page, scope, label, value) {
  await scope.locator(`button[aria-label="${label}"]`).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
async function closeAttempt(page, scope, kind) {
  if (kind === "取消") await button(scope, "取消").click();
  else if (kind === "X") await button(scope, "关闭").click();
  else if (kind === "Esc") await page.keyboard.press("Escape");
  else await page.mouse.click(2, 2);
}
async function reconnect(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
}
const menu = (id, parentId = 0, type = 2) => ({
  id,
  parentId,
  name: `菜单${id}`,
  type,
  icon: "old",
  path: "/old",
  openType: 1,
  uri: "old-uri",
  permission: `perm:${id}`,
  sort: 0,
  keepAlive: true,
  hidden: true,
  memo: "保留",
  createdAt: 1767225600,
  updatedAt: null,
});
async function setup(t, { authenticated = true, admin = true } = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
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
            extraInfo: {},
            roles: [],
            authorities: admin ? ["system:admin"] : [],
          }),
        );
      },
      { admin },
    );
  const state = {
    records: [
      menu(1, 0, 1),
      menu(2, 1),
      menu(3, 2, 3),
      menu(4),
      ...Array.from({ length: 197 }, (_, i) => menu(i + 5)),
    ],
    requests: [],
    posts: [],
    failList: false,
    failRoots: false,
    failDetail: false,
    failSave: false,
    zeroCreate: false,
    failAction: false,
    failUser: false,
    saveDelay: null,
    detailDelay: null,
    userDelay: null,
  };
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.requests.push(`${request.method()} ${url.pathname}${url.search}`);
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    const fail = () =>
      route.fulfill({ status: 400, json: { code: 10112, msg: "受控请求失败", result: null } });
    if (url.pathname === "/api/menu/v1/findByPage") {
      if (state.failList) return fail();
      const payload = request.postDataJSON();
      assert.deepEqual(payload.bean, {});
      assert.equal(payload.pageSize, 100);
      return ok({
        list: state.records.slice((payload.page - 1) * 100, payload.page * 100),
        total: state.records.length,
        pageNumber: payload.page,
        pageSize: 100,
      });
    }
    if (url.pathname === "/api/menu/v1/getMenuTree")
      return state.failRoots
        ? fail()
        : ok(state.records.filter((row) => row.parentId === 0 && row.id !== 4));
    if (url.pathname.startsWith("/api/menu/v1/findById/")) {
      const id = Number(url.pathname.split("/").at(-1));
      const snapshot = structuredClone(state.records.find((row) => row.id === id));
      if (state.detailDelay?.id === id) await state.detailDelay.promise;
      return state.failDetail ? fail() : ok(snapshot);
    }
    if (/\/menu\/v1\/(createMenu|updateMenu)$/.test(url.pathname)) {
      const payload = request.postDataJSON();
      state.posts.push({ path: url.pathname, payload });
      assert.equal(typeof payload.type, "number");
      if (payload.openType !== undefined) assert.equal(typeof payload.openType, "number");
      assert.equal(typeof payload.parentId, "number");
      for (const key of ["sort", "keepAlive", "hidden", "memo"])
        assert.equal(Object.hasOwn(payload, key), false);
      if (state.saveDelay) await state.saveDelay.promise;
      if (state.failSave) return fail();
      if (url.pathname.endsWith("createMenu")) {
        if (state.zeroCreate) return ok(0);
        const id = Math.max(...state.records.map((row) => row.id)) + 1;
        state.records.push({ ...menu(id), ...payload });
        return ok(id);
      }
      Object.assign(
        state.records.find((row) => row.id === payload.id),
        payload,
      );
      return ok("success");
    }
    if (/\/menu\/v1\/(valid|invalid)\//.test(url.pathname)) {
      assert.equal(request.method(), "POST");
      assert.equal(request.postData(), null);
      state.posts.push({ path: url.pathname });
      return state.failAction ? fail() : ok("success");
    }
    if (url.pathname === "/api/menu/v1/getMenuTreeByUser") {
      const id = Number(url.searchParams.get("userId"));
      if (state.userDelay?.id === id) await state.userDelay.promise;
      return state.failUser ? fail() : ok([{ ...menu(id * 1000), name: `用户${id}菜单` }]);
    }
    assert.doesNotMatch(url.pathname, /menu.*delete/i);
    if (/avatar\/content$/.test(url.pathname)) return route.fulfill({ status: 404, body: "" });
    return ok([]);
  });
  await page.goto(`${base}/sys/menus`);
  if (authenticated && admin) await recordRow(page).waitFor();
  return { page, state };
}
async function createForm(page) {
  await button(page, "新增菜单").click();
  await form(page).waitFor();
  return form(page);
}
async function fillName(scope, name = "测试菜单") {
  await scope.getByRole("textbox", { name: "菜单名称", exact: true }).fill(name);
}
fixture("登录/管理员路由守卫无菜单请求", async (t) => {
  for (const auth of [{ authenticated: false }, { authenticated: true, admin: false }]) {
    const { page, state } = await setup(t, auth);
    await page.waitForURL(auth.authenticated ? "**/projects" : "**/login?**");
    assert.equal(state.requests.filter((path) => path.includes("/menu/v1/")).length, 0);
  }
});
fixture("多页完整树、三级展开/折叠、禁用根保留，两动作无状态推断/删除", async (t) => {
  const { page, state } = await setup(t);
  assert.equal(state.requests.filter((path) => path.endsWith("/findByPage")).length, 3);
  await recordRow(page, 4).waitFor();
  assert.equal(await recordRow(page, 2).count(), 0);
  await button(page, "全部展开").click();
  await recordRow(page, 3).waitFor();
  await button(page, "折叠菜单1 (#1)").click();
  assert.equal(await recordRow(page, 3).count(), 0);
  await button(page, "全部展开").click();
  await button(page, "刷新").click();
  await recordRow(page, 3).waitFor();
  await button(page, "全部折叠").click();
  assert.equal(await button(recordRow(page), "启用").count(), 1);
  assert.equal(await button(recordRow(page), "禁用").count(), 1);
  assert.equal(await button(page, "删除").count(), 0);
});
fixture("多字段全量校验、字段编辑只清自身、RequiredMark", async (t) => {
  const { page, state } = await setup(t);
  state.records[0].type = 99;
  state.records[0].openType = 99;
  state.records[0].name = "";
  state.records[0].parentId = 99999;
  await button(recordRow(page), "编辑").click();
  const scope = form(page, true);
  await scope.getByRole("textbox", { name: "菜单名称", exact: true }).waitFor();
  assert.equal(await scope.locator(".sr-only").filter({ hasText: "（必填）" }).count(), 2);
  await button(scope, "保存").click();
  await scope.getByText("请输入菜单名称", { exact: true }).waitFor();
  await fillName(scope);
  assert.equal(await scope.getByText("请输入菜单名称", { exact: true }).count(), 0);
  await scope.getByText("请选择支持的打开方式", { exact: true }).waitFor();
  assert.equal(state.posts.length, 0);
});
for (const field of [
  "菜单名称",
  "路由地址",
  "图标标识",
  "定位标识",
  "权限标识",
  "菜单类型",
  "打开方式",
  "父级菜单",
])
  fixture(`${field} dirty 的取消/X/Esc/遮罩、继续、放弃重开`, async (t) => {
    const { page } = await setup(t);
    const scope = await createForm(page);
    if (field === "菜单类型") await select(page, scope, "菜单类型（必填）", "按钮");
    else if (field === "打开方式") await select(page, scope, "打开方式", "外链");
    else if (field === "父级菜单") await select(page, scope, "父级菜单", "菜单1 (#1)");
    else await scope.getByRole("textbox", { name: field, exact: true }).fill("草稿");
    for (const kind of ["取消", "X", "Esc", "遮罩"]) {
      await closeAttempt(page, scope, kind);
      await discard(page).waitFor();
      await button(discard(page), "继续编辑").click();
      await scope.waitFor();
    }
    await button(scope, "取消").click();
    await button(discard(page), "放弃修改").click();
    await scope.waitFor({ state: "hidden" });
    const reopened = await createForm(page);
    assert.equal(
      await reopened.getByRole("textbox", { name: "菜单名称", exact: true }).inputValue(),
      "",
    );
  });
fixture("改回基线干净；保存失败和0L不关窗，草稿保留；重复点击一请求", async (t) => {
  const { page, state } = await setup(t);
  let scope = await createForm(page);
  await fillName(scope);
  await fillName(scope, "");
  await button(scope, "取消").click();
  await scope.waitFor({ state: "hidden" });
  scope = await createForm(page);
  await fillName(scope);
  state.zeroCreate = true;
  await button(scope, "创建").click();
  await scope.getByText(/创建未成功/).waitFor();
  assert.equal(await scope.isVisible(), true);
  state.zeroCreate = false;
  state.failSave = true;
  await button(scope, "创建").click();
  await scope.getByRole("alert").waitFor();
  assert.equal(
    await scope.getByRole("textbox", { name: "菜单名称", exact: true }).inputValue(),
    "测试菜单",
  );
  state.failSave = false;
  state.saveDelay = deferred();
  const before = state.posts.length;
  await button(scope, "创建").dblclick();
  await eventually(() => assert.equal(state.posts.length, before + 1));
  for (const kind of ["X", "Esc", "遮罩"]) {
    await closeAttempt(page, scope, kind);
    assert.equal(await scope.isVisible(), true);
  }
  state.saveDelay.resolve();
  await scope.waitFor({ state: "hidden" });
  assert.equal(await discard(page).count(), 0);
  scope = await createForm(page);
  await fillName(scope);
  await button(scope, "取消").click();
  await discard(page).waitFor();
});
fixture("父级排除自身/后代/按钮；清空字符串、移根0、扩展字段不覆盖", async (t) => {
  const { page, state } = await setup(t);
  await button(page, "全部展开").click();
  await button(recordRow(page, 2), "编辑").click();
  const scope = form(page, true);
  await scope.getByRole("textbox", { name: "菜单名称", exact: true }).waitFor();
  await scope.locator('button[aria-label="父级菜单"]').click();
  assert.equal(await page.getByRole("option", { name: /菜单2 \(#2\)/ }).count(), 0);
  assert.equal(await page.getByRole("option", { name: /菜单3 \(#3\)/ }).count(), 0);
  await page.getByRole("option", { name: "顶级菜单", exact: true }).click();
  for (const name of ["路由地址", "图标标识", "定位标识", "权限标识"])
    await scope.getByRole("textbox", { name, exact: true }).fill("");
  await button(scope, "保存").click();
  await scope.waitFor({ state: "hidden" });
  const payload = state.posts.at(-1).payload;
  assert.equal(payload.parentId, 0);
  for (const key of ["path", "icon", "uri", "permission"]) assert.equal(payload[key], "");
  assert.equal(state.records.find((row) => row.id === 2).memo, "保留");
});
for (const verb of ["启用", "禁用"])
  fixture(`${verb}只作用记录、失败目标保留可重试`, async (t) => {
    const { page, state } = await setup(t);
    await button(recordRow(page), verb).click();
    const scope = page.getByRole("dialog", { name: `${verb}菜单`, exact: true });
    await scope.getByText(/仅作用于该记录/).waitFor();
    state.failAction = true;
    await button(scope, `确定${verb}`).click();
    await scope.getByRole("alert").waitFor();
    state.failAction = false;
    await button(scope, `确定${verb}`).click();
    await scope.waitFor({ state: "hidden" });
    await recordRow(page).waitFor();
  });
fixture("dirty详情刷新及失败不丢草稿/守卫；版本变化复核后再提交", async (t) => {
  const { page, state } = await setup(t);
  await button(recordRow(page), "编辑").click();
  const scope = form(page, true);
  await scope.getByRole("textbox", { name: "定位标识", exact: true }).fill("用户草稿");
  state.records[0].name = "最新名称";
  await reconnect(page);
  await page.getByText(/菜单信息在后台有更新/).waitFor();
  await button(scope, "保存").click();
  await scope.getByText(/请复核后重新提交/).waitFor();
  assert.equal(state.posts.length, 0);
  state.failDetail = true;
  await reconnect(page);
  await scope.getByText(/加载失败/).waitFor();
  await button(scope, "关闭").click();
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  state.failDetail = false;
  await button(scope, "重试").click();
  assert.equal(
    await scope.getByRole("textbox", { name: "定位标识", exact: true }).inputValue(),
    "用户草稿",
  );
  await button(scope, "保存").click();
  await scope.waitFor({ state: "hidden" });
  assert.equal(state.posts[0].payload.name, "最新名称");
});
fixture("旧会话详情不覆盖新目标", async (t) => {
  const { page, state } = await setup(t);
  const delayed = deferred();
  state.detailDelay = { id: 1, ...delayed };
  await button(recordRow(page), "编辑").click();
  const scope = form(page, true);
  await scope.getByText("正在加载菜单信息…", { exact: true }).waitFor();
  await button(scope, "关闭").click();
  await button(recordRow(page, 4), "编辑").click();
  await scope.getByRole("textbox", { name: "菜单名称", exact: true }).waitFor();
  delayed.resolve();
  await eventually(async () =>
    assert.equal(
      await scope.getByRole("textbox", { name: "菜单名称", exact: true }).inputValue(),
      "菜单4",
    ),
  );
});
fixture("导航/beforeunload 守卫", async (t) => {
  const { page } = await setup(t);
  await page.goto(`${base}/sys/profile`);
  await page.goto(`${base}/sys/menus`);
  const scope = await createForm(page);
  await fillName(scope);
  const back = page.goBack();
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  await back;
  assert.equal(new URL(page.url()).pathname, "/sys/menus");
  const native = page.waitForEvent("dialog");
  const reload = page.reload().catch(() => {});
  const prompt = await native;
  assert.equal(prompt.type(), "beforeunload");
  await prompt.dismiss();
  await reload;
  const leave = page.goBack();
  await discard(page).waitFor();
  await button(discard(page), "放弃修改").click();
  await leave;
  await page.waitForURL("**/sys/profile");
});
fixture("用户非法ID不请求、显式查询、A/B隔离、刷新错误保留结果，绝不拼管理子节点", async (t) => {
  const { page, state } = await setup(t);
  const input = page.getByRole("textbox", { name: "用户 ID", exact: true });
  await input.fill("0");
  await button(page, "查询").click();
  await page.getByText("请输入正的安全整数用户 ID").waitFor();
  assert.equal(
    state.requests.some((path) => path.includes("getMenuTreeByUser")),
    false,
  );
  const delayed = deferred();
  state.userDelay = { id: 1, ...delayed };
  await input.fill("1");
  await button(page, "查询").click();
  await input.fill("2");
  await button(page, "查询").click();
  const tree = page.getByRole("table", { name: "用户菜单结果" });
  await tree.getByText("用户2菜单").waitFor();
  delayed.resolve();
  assert.equal(await tree.getByText("用户1菜单").count(), 0);
  assert.equal(await tree.getByText("菜单3").count(), 0);
  state.failUser = true;
  await button(page, "刷新用户菜单").click();
  await page.getByText(/刷新失败，展示上次结果/).waitFor();
  await tree.getByText("用户2菜单").waitFor();
});

// Optional future real acceptance; never fulfils/routes a backend response with a fixture.
test("LIVE: 创建三级菜单、编辑/移根/状态读回、两用户原始结果记录", { skip: !live }, async (t) => {
  assert.ok(process.env.P5_MENU_AUTH_JSON, "live requires session JSON from environment");
  const auth = JSON.parse(process.env.P5_MENU_AUTH_JSON);
  const userIds = (process.env.P5_MENU_USER_IDS ?? "").split(",").map(Number);
  assert.equal(userIds.length, 2);
  assert.ok(userIds.every((id) => Number.isSafeInteger(id) && id > 0));
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.addInitScript((session) => {
    for (const key of ["token", "refreshToken", "userInfo"])
      localStorage.setItem(key, key === "userInfo" ? JSON.stringify(session[key]) : session[key]);
  }, auth);
  const page = await context.newPage();
  const created = [];
  const prefix = `p5-menu-accept-${Date.now()}`;
  const call = async (method, suffix, body) => {
    const response = await context.request.fetch(`${base}/api/menu/v1/${suffix}`, {
      method,
      headers: { token: auth.token },
      ...(body === undefined ? {} : { data: body }),
    });
    const envelope = await response.json();
    console.log(
      JSON.stringify({
        method,
        path: `/api/menu/v1/${suffix}`,
        status: response.status(),
        response: envelope,
      }),
    );
    assert.equal(envelope.code, 1);
    return envelope.result;
  };
  try {
    await page.goto(`${base}/sys/menus`);
    await page.getByRole("heading", { name: "菜单管理", exact: true }).waitFor();
    for (const [index, type, label] of [
      [0, 1, "目录"],
      [1, 2, "菜单"],
      [2, 3, "按钮"],
    ]) {
      const scope = await createForm(page);
      await fillName(scope, `${prefix}-${label}`);
      await select(page, scope, "菜单类型（必填）", label);
      if (index)
        await select(
          page,
          scope,
          "父级菜单",
          `${prefix}-${index === 1 ? "目录" : "菜单"} (#${created[index - 1]})`,
        );
      const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith("/menu/v1/createMenu") && r.request().method() === "POST",
      );
      await button(scope, "创建").click();
      const response = await responsePromise;
      const envelope = await response.json();
      console.log(
        JSON.stringify({ method: "POST", path: "/api/menu/v1/createMenu", response: envelope }),
      );
      assert.ok(Number.isSafeInteger(envelope.result) && envelope.result > 0);
      created.push(envelope.result);
      await scope.waitFor({ state: "hidden" });
      const detail = await call("GET", `findById/${envelope.result}`);
      assert.equal(detail.type, type);
      assert.equal(detail.parentId, index ? created[index - 1] : 0);
    }
    await button(page, "全部展开").click();
    await recordRow(page, created[2]).waitFor();
    await button(page, "全部折叠").click();
    assert.equal(await recordRow(page, created[2]).count(), 0);
    await button(page, "全部展开").click();
    const id = created[1];
    const beforeDetail = await call("GET", `findById/${id}`);
    await button(recordRow(page, id), "编辑").click();
    const scope = form(page, true);
    await scope.getByRole("textbox", { name: "菜单名称", exact: true }).waitFor();
    await fillName(scope, `${prefix}-edited`);
    await select(page, scope, "菜单类型（必填）", "目录");
    await select(page, scope, "打开方式", "外链");
    await select(page, scope, "父级菜单", "顶级菜单");
    for (const name of ["路由地址", "图标标识", "定位标识", "权限标识"])
      await scope.getByRole("textbox", { name, exact: true }).fill("");
    await button(scope, "保存").click();
    await scope.waitFor({ state: "hidden" });
    const afterDetail = await call("GET", `findById/${id}`);
    assert.equal(afterDetail.parentId, 0);
    assert.equal(afterDetail.type, 1);
    assert.equal(afterDetail.openType, 3);
    for (const key of ["path", "icon", "uri", "permission"]) assert.equal(afterDetail[key], "");
    for (const key of ["sort", "keepAlive", "hidden", "memo"])
      assert.equal(afterDetail[key], beforeDetail[key]);
    for (const [action, verb] of [
      ["invalid", "禁用"],
      ["valid", "启用"],
    ]) {
      await button(recordRow(page, id), verb).click();
      const modal = page.getByRole("dialog", { name: `${verb}菜单`, exact: true });
      await button(modal, `确定${verb}`).click();
      await modal.waitFor({ state: "hidden" });
      await call("GET", `findById/${id}`);
      await call("GET", "getMenuTree");
      await call("GET", `getChildrenByParentId?parentId=${created[0]}`);
      console.log(
        `${action}: tree cache/filter effects must be assessed from recorded responses; no status field is inferred.`,
      );
    }
    for (const userId of userIds) {
      await page.getByRole("textbox", { name: "用户 ID", exact: true }).fill(String(userId));
      await button(page, "查询").click();
      await call("GET", `getMenuTreeByUser?userId=${userId}`);
    }
    console.log(
      "User results are recorded without claiming permission isolation; current backend does not filter by user.",
    );
  } finally {
    for (const id of created.reverse()) {
      try {
        await call("POST", `invalid/${id}`);
      } catch {
        console.log(`Cleanup disable failed for menu #${id}; retry manually.`);
      }
    }
  }
});
