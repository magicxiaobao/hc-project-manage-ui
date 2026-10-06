/**
 * 浏览器交互验收（真实路由/共享守卫；API 用受控夹具拦截）。
 * 启动 pnpm dev 后：
 * P5_BROWSER_BASE_URL=http://127.0.0.1:8080 pnpm exec node scripts/permission-list.browser.mjs
 * 这些测试不替代 spec §6.3 的真实后端八步验收；本次实施未执行浏览器用例。
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
const button = (scope, name) => scope.getByRole("button", { name, exact: true });
const form = (page, edit = false) =>
  page.getByRole("dialog", { name: edit ? "编辑权限点" : "新增权限点", exact: true });
const discard = (page) => page.getByRole("dialog", { name: "是否放弃修改？", exact: true });
const recordRow = (page, id = 1) =>
  page
    .getByRole("table", { name: "权限点列表" })
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: `code:${id}`, exact: true }) });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function eventually(check) {
  const deadline = Date.now() + 15_000;
  let error;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (caught) {
      error = caught;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw error;
}
async function select(page, scope, label, value) {
  // OptionSelect 使用实际 HeroUI button/listbox；显式 aria-label 保证必填语音。
  await scope.locator(`button[aria-label="${label}"]`).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
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
            roles: ["TEST"],
            authorities: admin ? ["system:admin"] : [],
          }),
        );
      },
      { admin },
    );
  const state = {
    records: Array.from({ length: 201 }, (_, i) => ({
      id: i + 1,
      permissionName: `权限${i + 1}`,
      permissionCode: `code:${i + 1}`,
      permissionType: "MENU",
      groupName: "系统",
      description: `描述${i + 1}`,
      enabled: i !== 1,
      createdAt: null,
      updatedAt: 1767225600,
    })),
    requests: [],
    posts: [],
    failList: false,
    failDetail: false,
    failSave: null,
    failAction: false,
    listDelay: null,
    saveDelay: null,
    actionDelay: null,
    detailDelay: null,
  };
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.requests.push(`${request.method()} ${url.pathname}`);
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    const fail = (code = 10001) =>
      route.fulfill({ status: 400, json: { code, msg: "受控请求失败", result: null } });
    if (url.pathname === "/api/permission/v1/findByPage") {
      if (state.listDelay) await state.listDelay.promise;
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
    if (url.pathname.startsWith("/api/permission/v1/findById/")) {
      const id = Number(url.pathname.split("/").at(-1));
      const snapshot = structuredClone(state.records.find((row) => row.id === id));
      if (state.detailDelay?.id === id) await state.detailDelay.promise;
      return state.failDetail ? fail() : ok(snapshot);
    }
    if (/\/permission\/v1\/(createPermission|updatePermission)$/.test(url.pathname)) {
      const payload = request.postDataJSON();
      state.posts.push({ path: url.pathname, payload });
      if (state.saveDelay) await state.saveDelay.promise;
      if (state.failSave === "network") return route.abort("failed");
      if (state.failSave) return fail(state.failSave);
      if (url.pathname.endsWith("createPermission")) {
        const id = Math.max(...state.records.map((row) => row.id)) + 1;
        state.records.push({ ...payload, id, createdAt: 1767225600, updatedAt: 1767225600 });
        return ok(id);
      }
      Object.assign(
        state.records.find((row) => row.id === payload.id),
        payload,
      );
      return ok("操作成功");
    }
    if (/\/permission\/v1\/(valid|invalid|delete)\//.test(url.pathname)) {
      assert.equal(request.method(), "POST");
      assert.equal(request.postData(), null);
      const action = url.pathname.split("/").at(-2);
      const id = Number(url.pathname.split("/").at(-1));
      state.posts.push({ action, id });
      if (state.actionDelay) await state.actionDelay.promise;
      if (state.failAction) return fail();
      state.records.find((row) => row.id === id).enabled = action === "valid";
      return ok("操作成功");
    }
    if (/avatar\/content$/.test(url.pathname)) return route.fulfill({ status: 404, body: "" });
    return ok([]);
  });
  await page.goto(`${base}/sys/permissions`);
  if (authenticated && admin) await recordRow(page).waitFor();
  return { page, state };
}
async function createForm(page) {
  await button(page, "新增权限点").click();
  await form(page).waitFor();
  return form(page);
}
async function fillValid(page, scope) {
  await scope.getByRole("textbox", { name: "权限名称", exact: true }).fill("测试权限");
  await scope.getByRole("textbox", { name: "权限编码", exact: true }).fill("new:code");
  await select(page, scope, "权限类型（必填）", "接口");
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

test("未登录/非管理员跳转，权限域无请求；redirect 保留", async (t) => {
  for (const auth of [{ authenticated: false }, { authenticated: true, admin: false }]) {
    const { page, state } = await setup(t, auth);
    await page.waitForURL(auth.authenticated ? "**/projects" : "**/login?**");
    assert.equal(state.requests.filter((path) => path.includes("/permission/v1/")).length, 0);
    if (!auth.authenticated)
      assert.equal(new URL(page.url()).searchParams.get("redirect"), "/sys/permissions");
  }
});
test("三条件输入态/提交态、后页匹配、20条分页、重置/空结果", async (t) => {
  const { page, state } = await setup(t);
  assert.equal(await page.getByRole("table").getByRole("row").count(), 21);
  assert.match(await page.locator("body").innerText(), /共 201 个权限点/);
  state.records[200] = {
    ...state.records[200],
    permissionCode: "SPECIAL:READ",
    groupName: "Research",
    permissionType: "API",
  };
  await button(page, "刷新").click();
  await page.getByRole("textbox", { name: "权限编码筛选" }).fill(" special ");
  await page.getByRole("textbox", { name: "所属分组筛选" }).fill(" search ");
  await select(page, page, "权限类型", "接口");
  assert.match(await page.locator("body").innerText(), /共 201 个权限点/);
  await page.getByRole("textbox", { name: "权限编码筛选" }).press("Enter");
  await page.getByRole("cell", { name: "SPECIAL:READ", exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /共 1 个权限点/);
  await page.getByRole("textbox", { name: "所属分组筛选" }).fill("不存在");
  await button(page, "搜索").click();
  await page.getByText("没有匹配的权限点", { exact: true }).waitFor();
  await button(page, "重置").click();
  await button(page, "下一页").click();
  assert.match(await page.locator("body").innerText(), /第 2 \/ 11 页/);
  await button(page, "重置").click();
  assert.match(await page.locator("body").innerText(), /第 1 \/ 11 页/);
});
test("三个必填同时报错，编辑仅清自身；真实 RequiredMark/aria-label/FieldError 位置", async (t) => {
  const { page } = await setup(t);
  const scope = await createForm(page);
  assert.equal(await scope.locator(".sr-only").filter({ hasText: "（必填）" }).count(), 3);
  assert.equal(await scope.locator('button[aria-label="权限类型（必填）"]').count(), 1);
  assert.equal(await scope.getByRole("switch", { name: "是否启用" }).isChecked(), true);
  await button(scope, "创建").click();
  assert.equal(await scope.getByRole("alert").count(), 3);
  const input = scope.getByRole("textbox", { name: "权限名称", exact: true });
  await input.fill("名称");
  assert.equal(await scope.getByRole("alert").count(), 2);
  assert.equal(await scope.getByText("请输入权限名称", { exact: true }).count(), 0);
  const code = scope.getByRole("textbox", { name: "权限编码", exact: true });
  assert.match(await code.locator("../..").innerText(), /请输入权限编码/);
});
for (const field of ["权限名称", "权限编码", "权限类型", "所属分组", "描述", "启用"]) {
  test(`${field} dirty：取消/X/遮罩/Esc 均守卫，继续编辑保留，放弃关闭`, async (t) => {
    const { page } = await setup(t);
    const scope = await createForm(page);
    if (field === "权限类型") await select(page, scope, "权限类型（必填）", "按钮");
    else if (field === "启用") await scope.getByRole("switch", { name: "是否启用" }).uncheck();
    else await scope.getByRole("textbox", { name: field, exact: true }).fill("草稿 ");
    for (const kind of ["取消", "X", "遮罩", "Esc"]) {
      await closeAttempt(page, scope, kind);
      await discard(page).waitFor();
      await button(discard(page), "继续编辑").click();
      await scope.waitFor();
      if (!["权限类型", "启用"].includes(field))
        assert.equal(
          await scope.getByRole("textbox", { name: field, exact: true }).inputValue(),
          "草稿 ",
        );
    }
    await button(scope, "取消").click();
    await discard(page).waitFor();
    await button(discard(page), "放弃修改").click();
    await scope.waitFor({ state: "hidden" });
    const reopened = await createForm(page);
    assert.equal(
      await reopened.getByRole("textbox", { name: "权限名称", exact: true }).inputValue(),
      "",
    );
  });
}
test("字段改回原值无需确认；成功后重新修改仍布防", async (t) => {
  const { page } = await setup(t);
  let scope = await createForm(page);
  await scope.getByRole("textbox", { name: "权限名称", exact: true }).fill("临时");
  await scope.getByRole("textbox", { name: "权限名称", exact: true }).fill("");
  await button(scope, "取消").click();
  await scope.waitFor({ state: "hidden" });
  assert.equal(await discard(page).count(), 0);
  scope = await createForm(page);
  await fillValid(page, scope);
  await button(scope, "创建").click();
  await scope.waitFor({ state: "hidden" });
  scope = await createForm(page);
  await scope.getByRole("textbox", { name: "描述", exact: true }).fill("新草稿");
  await button(scope, "取消").click();
  await discard(page).waitFor();
});
test("详情回填、清空字符串、enabled=null 未操作保留；失败重试", async (t) => {
  const { page, state } = await setup(t);
  state.records[0] = { ...state.records[0], enabled: null, permissionName: "详情名称" };
  state.failDetail = true;
  await button(recordRow(page), "编辑").click();
  const scope = form(page, true);
  await scope.getByText(/加载失败：/).waitFor();
  assert.equal(await button(scope, "保存").count(), 0);
  state.failDetail = false;
  await button(scope, "重试").click();
  await scope.getByRole("textbox", { name: "权限名称", exact: true }).waitFor();
  assert.equal(
    await scope.getByRole("textbox", { name: "权限名称", exact: true }).inputValue(),
    "详情名称",
  );
  await scope.getByRole("textbox", { name: "所属分组", exact: true }).fill("");
  await scope.getByRole("textbox", { name: "描述", exact: true }).fill("");
  await button(scope, "保存").click();
  await scope.waitFor({ state: "hidden" });
  assert.equal(state.posts[0].payload.enabled, null);
  assert.equal(state.posts[0].payload.groupName, "");
  assert.equal(state.posts[0].payload.description, "");
});
test("预检后页禁用编码命中/读取失败阻止 POST，保留草稿", async (t) => {
  const { page, state } = await setup(t);
  state.records[200].enabled = false;
  const scope = await createForm(page);
  await fillValid(page, scope);
  await scope.getByRole("textbox", { name: "权限编码", exact: true }).fill(" code:201 ");
  await button(scope, "创建").click();
  await scope.getByText("权限编码已存在", { exact: true }).waitFor();
  assert.equal(state.posts.length, 0);
  await scope.getByRole("textbox", { name: "权限编码", exact: true }).fill("another");
  state.failList = true;
  await button(scope, "创建").click();
  await scope.getByText(/权限编码唯一性预检失败：/).waitFor();
  assert.equal(state.posts.length, 0);
  assert.equal(
    await scope.getByRole("textbox", { name: "权限名称", exact: true }).inputValue(),
    "测试权限",
  );
});
for (const code of [10002, 10003, 10112, "network"])
  test(`保存错误 ${code} 字段落点与整体说明；失败保留 dirty`, async (t) => {
    const { page, state } = await setup(t);
    state.failSave = code;
    const scope = await createForm(page);
    await fillValid(page, scope);
    await button(scope, "创建").click();
    if ([10002, 10003].includes(code))
      await scope.getByText(/可能已被占用，也可能是其他保存错误/).waitFor();
    else {
      await scope.getByText("提交失败，请检查表单后重试", { exact: true }).waitFor();
      await scope.getByText(/创建失败：/).waitFor();
    }
    assert.equal(await scope.getByText("权限编码已存在", { exact: true }).count(), 0);
    await scope.getByRole("textbox", { name: "权限编码", exact: true }).fill("retry:code");
    assert.equal(await scope.getByText(/可能已被占用/).count(), 0);
    if (![10002, 10003].includes(code))
      assert.equal(await scope.getByText(/创建失败：/).count(), 1);
    await button(scope, "取消").click();
    await discard(page).waitFor();
  });
test("预检和POST在途冻结控件及取消/X/遮罩/Esc，无重复保存", async (t) => {
  const { page, state } = await setup(t);
  const scope = await createForm(page);
  await fillValid(page, scope);
  state.listDelay = deferred();
  await button(scope, "创建").click();
  await eventually(async () => assert.equal(await button(scope, "取消").isDisabled(), true));
  for (const kind of ["X", "遮罩", "Esc"]) {
    await closeAttempt(page, scope, kind);
    assert.equal(await scope.isVisible(), true);
  }
  assert.equal(
    await scope.getByRole("textbox", { name: "权限名称", exact: true }).isDisabled(),
    true,
  );
  state.saveDelay = deferred();
  state.listDelay.resolve();
  await eventually(() => assert.equal(state.posts.length, 1));
  for (const kind of ["X", "遮罩", "Esc"]) {
    await closeAttempt(page, scope, kind);
    assert.equal(await scope.isVisible(), true);
  }
  state.saveDelay.resolve();
  await scope.waitFor({ state: "hidden" });
  assert.equal(state.posts.length, 1);
});
for (const [action, verb, id] of [
  ["valid", "启用", 2],
  ["invalid", "禁用", 1],
  ["delete", "删除", 2],
])
  test(`${verb}确认、取消、pending锁定、失败重试；删除行仍保留`, async (t) => {
    const { page, state } = await setup(t);
    const row = recordRow(page, id);
    await button(row, verb).click();
    const scope = page.getByRole("dialog", { name: `${verb}权限点`, exact: true });
    await scope.waitFor();
    if (action === "delete")
      assert.match(await scope.innerText(), /标记为禁用，权限记录、编码和已有角色关联仍保留/);
    assert.equal(state.posts.length, 0);
    await button(scope, "取消").click();
    assert.equal(state.posts.length, 0);
    await button(row, verb).click();
    state.actionDelay = deferred();
    state.failAction = true;
    await button(scope, `确定${verb}`).click();
    await eventually(() => assert.equal(state.posts.length, 1));
    assert.equal(await button(scope, "取消").isDisabled(), true);
    for (const kind of ["X", "遮罩", "Esc"]) {
      await closeAttempt(page, scope, kind);
      assert.equal(await scope.isVisible(), true);
    }
    assert.equal(await button(page, "新增权限点").isDisabled(), true);
    state.actionDelay.resolve();
    await scope.getByRole("alert").waitFor();
    state.actionDelay = null;
    state.failAction = false;
    await button(scope, `确定${verb}`).click();
    await scope.waitFor({ state: "hidden" });
    await eventually(async () =>
      assert.equal(
        await row
          .getByRole("cell", { name: action === "valid" ? "启用" : "禁用", exact: true })
          .count(),
        1,
      ),
    );
    assert.equal(
      state.records.some((record) => record.id === id),
      true,
    );
    if (action === "delete") {
      await page.getByText("删除操作完成，权限点已标记为禁用", { exact: true }).waitFor();
      assert.equal(await button(row, "启用").count(), 1);
    }
  });
test("dirty详情重取保留草稿，提交版本变更要求复核；不发旧POST", async (t) => {
  const { page, state } = await setup(t);
  await button(recordRow(page), "编辑").click();
  const scope = form(page, true);
  await scope.getByRole("textbox", { name: "权限名称", exact: true }).waitFor();
  await scope.getByRole("textbox", { name: "描述", exact: true }).fill("用户草稿");
  const count = state.requests.filter((path) => path.endsWith("/findById/1")).length;
  state.records[0] = { ...state.records[0], permissionName: "最新名称", groupName: "新组" };
  await reconnect(page);
  await eventually(() =>
    assert.ok(state.requests.filter((path) => path.endsWith("/findById/1")).length > count),
  );
  await page.getByText(/权限信息在后台有更新/).waitFor();
  assert.equal(
    await scope.getByRole("textbox", { name: "描述", exact: true }).inputValue(),
    "用户草稿",
  );
  await button(scope, "保存").click();
  await page.getByText(/请复核后重新提交/).waitFor();
  assert.equal(state.posts.length, 0);
  assert.equal(
    await scope.getByRole("textbox", { name: "权限名称", exact: true }).inputValue(),
    "最新名称",
  );
  await button(scope, "保存").click();
  await scope.waitFor({ state: "hidden" });
  assert.equal(state.posts[0].payload.description, "用户草稿");
});
test("路由、后退、beforeunload 守卫；成功与待决后退并发可结束导航", async (t) => {
  const { page, state } = await setup(t);
  await page.goto(`${base}/sys/profile`);
  await page.goto(`${base}/sys/permissions`);
  await recordRow(page).waitFor();
  const scope = await createForm(page);
  await fillValid(page, scope);
  const back = page.goBack();
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  await back;
  assert.equal(new URL(page.url()).pathname, "/sys/permissions");
  const native = page.waitForEvent("dialog");
  const reload = page.reload().catch(() => {});
  const prompt = await native;
  assert.equal(prompt.type(), "beforeunload");
  await prompt.dismiss();
  await reload;
  assert.equal(
    await scope.getByRole("textbox", { name: "权限名称", exact: true }).inputValue(),
    "测试权限",
  );
  state.saveDelay = deferred();
  await button(scope, "创建").click();
  await eventually(() => assert.equal(state.posts.length, 1));
  const pendingBack = page.goBack();
  await discard(page).waitFor();
  state.saveDelay.resolve();
  await scope.waitFor({ state: "hidden" });
  await button(discard(page), "放弃修改").click();
  await pendingBack;
  await page.waitForURL("**/sys/profile");
});

test("详情 A 迟到不覆盖新会话 B；未知类型必须明确重选", async (t) => {
  const { page, state } = await setup(t);
  const delayed = deferred();
  state.detailDelay = { id: 1, ...delayed };
  await button(recordRow(page), "编辑").click();
  const scope = form(page, true);
  await scope.getByText("正在加载权限信息…", { exact: true }).waitFor();
  await button(scope, "关闭").click();
  state.records[1].permissionType = "CUSTOM";
  await button(recordRow(page, 2), "编辑").click();
  await scope.getByRole("textbox", { name: "权限名称", exact: true }).waitFor();
  assert.equal(
    await scope.getByRole("textbox", { name: "权限名称", exact: true }).inputValue(),
    "权限2",
  );
  await scope.getByText("请选择支持的权限类型", { exact: true }).waitFor();
  delayed.resolve();
  await eventually(async () =>
    assert.equal(
      await scope.getByRole("textbox", { name: "权限编码", exact: true }).inputValue(),
      "code:2",
    ),
  );
  await button(scope, "保存").click();
  assert.equal(state.posts.length, 0);
  await select(page, scope, "权限类型（必填）", "数据");
  await button(scope, "保存").click();
  await scope.waitFor({ state: "hidden" });
  assert.equal(state.posts[0].payload.id, 2);
  assert.equal(state.posts[0].payload.permissionType, "DATA");
});
test("后台详情失败分支仍保留 dirty 路由守卫", async (t) => {
  const { page, state } = await setup(t);
  await button(recordRow(page), "编辑").click();
  const scope = form(page, true);
  await scope.getByRole("textbox", { name: "描述", exact: true }).fill("脏草稿");
  state.failDetail = true;
  await reconnect(page);
  await scope.getByText(/加载失败：/).waitFor();
  await button(scope, "关闭").click();
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  state.failDetail = false;
  await button(scope, "重试").click();
  await scope.getByRole("textbox", { name: "描述", exact: true }).waitFor();
  assert.equal(
    await scope.getByRole("textbox", { name: "描述", exact: true }).inputValue(),
    "脏草稿",
  );
});
test("刷新缩小结果后页码夹紧；无后台数据时首次空列表与筛选空结果区分", async (t) => {
  const { page, state } = await setup(t);
  for (let index = 0; index < 10; index++) await button(page, "下一页").click();
  assert.match(await page.locator("body").innerText(), /第 11 \/ 11 页/);
  state.records = state.records.slice(0, 21);
  await button(page, "刷新").click();
  await eventually(async () =>
    assert.match(await page.locator("body").innerText(), /第 2 \/ 2 页/),
  );
  state.records = [];
  await button(page, "刷新").click();
  await page.getByText("暂无权限点", { exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /第 1 \/ 1 页/);
});
test("预检在途确认路由离开后，旧结果不得提交或覆盖新建会话", async (t) => {
  const { page, state } = await setup(t);
  let scope = await createForm(page);
  await fillValid(page, scope);
  const delayed = deferred();
  state.listDelay = delayed;
  await button(scope, "创建").click();
  await eventually(async () => assert.equal(await button(scope, "取消").isDisabled(), true));
  // 应用内链接走真实 TanStack blocker；放弃离开使旧表单会话失效。
  await page
    .locator('a[href="/sys/profile"]')
    .first()
    .evaluate((link) => link.click());
  await discard(page).waitFor();
  await button(discard(page), "放弃修改").click();
  await page.waitForURL("**/sys/profile");
  state.listDelay = null;
  await page.goBack();
  await page.waitForURL("**/sys/permissions");
  await recordRow(page).waitFor();
  scope = await createForm(page);
  await scope.getByRole("textbox", { name: "权限名称", exact: true }).fill("新会话");
  delayed.resolve();
  await eventually(async () =>
    assert.equal(
      await scope.getByRole("textbox", { name: "权限名称", exact: true }).inputValue(),
      "新会话",
    ),
  );
  assert.equal(state.posts.length, 0);
  await button(scope, "取消").click();
  await discard(page).waitFor();
});
