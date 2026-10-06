/**
 * 系统配置浏览器专项（本地 fixture，不代表真实后端联调）。
 * 启动 pnpm dev 后：pnpm exec node scripts/system-config.browser.mjs
 * 真实后端 §6.4 需 worker 另行验收，本脚本不发真实管理请求。
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";
const base = checkedUrl(process.env.P5_BROWSER_BASE_URL ?? "http://127.0.0.1:8080");
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
const form = (page) => page.getByRole("dialog", { name: "新增配置", exact: true });
const discard = (page) => page.getByRole("dialog", { name: "是否放弃修改？", exact: true });
const row = (patch = {}) => ({
  id: 1,
  name: "fixture 配置",
  configKey: "fixture.key",
  configType: "STRING",
  configValue: "原始文本",
  description: "",
  enabled: true,
  memo: "保留",
  createdAt: 1767225600,
  updatedAt: 1767225601,
  ...patch,
});
async function setup(t, { authenticated = true, admin = true } = {}) {
  const context = await browser.newContext();
  t.after(() => context.close());
  if (authenticated)
    await context.addInitScript(
      ({ admin }) => {
        localStorage.setItem("token", "fixture-only-access");
        localStorage.setItem("refreshToken", "fixture-only-refresh");
        localStorage.setItem(
          "userInfo",
          JSON.stringify({
            userId: "1",
            userName: "fixture",
            cnName: null,
            extraInfo: {},
            roles: [],
            authorities: admin ? ["system:admin"] : [],
          }),
        );
      },
      { admin },
    );
  const page = await context.newPage();
  const state = { records: [row()], requests: [], writes: [], failSave: false, failRead: false };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    state.requests.push({ path: url.pathname, method: request.method() });
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    const fail = () =>
      route.fulfill({ status: 400, json: { code: 10003, msg: "fixture 请求失败", result: null } });
    if (url.pathname === "/api/menu/v1/getMenuTreeByUser")
      return ok([
        {
          id: 101,
          name: "系统配置管理",
          path: "/system/config",
          type: 2,
          parentId: 0,
          hidden: false,
          permission: "system:admin",
          sort: 0,
          icon: null,
          uri: null,
          openType: 1,
          keepAlive: null,
          memo: null,
          createdAt: null,
          updatedAt: null,
        },
      ]);
    if (!url.pathname.startsWith("/api/systemConfig/v1/")) return ok([]);
    const method = url.pathname.split("/").at(-1);
    if (method === "findByPage") {
      const p = request.postDataJSON();
      assert.equal(request.method(), "POST");
      assert.deepEqual(Object.keys(p).sort(), ["bean", "page", "pageSize"]);
      return ok({
        list: state.records.slice((p.page - 1) * p.pageSize, p.page * p.pageSize),
        total: state.records.length,
        pageNumber: p.page,
        pageSize: p.pageSize,
      });
    }
    if (url.pathname.includes("/findById/"))
      return ok(state.records.find((r) => r.id === Number(method)));
    if (method === "existsByConfigKey")
      return ok(state.records.some((r) => r.configKey === url.searchParams.get("configKey")));
    if (method === "validateConfigValue") return ok(true);
    if (method === "getConfigByKey")
      return state.failRead
        ? fail()
        : ok(
            state.records.find(
              (r) => r.configKey === url.searchParams.get("configKey") && r.enabled === true,
            ) ?? null,
          );
    if (method === "createSystemConfig" || method === "updateSystemConfig") {
      const payload = request.postDataJSON();
      state.writes.push({ method, payload });
      assert.equal(typeof payload.configValue, "string");
      assert.equal(typeof payload.enabled, "boolean");
      assert.equal(Object.hasOwn(payload, "memo"), false);
      if (state.failSave) return fail();
      if (method === "createSystemConfig") {
        const id = state.records.length + 1;
        state.records.push(row({ ...payload, id }));
        return ok(id);
      }
      Object.assign(
        state.records.find((r) => r.id === payload.id),
        payload,
      );
      return ok("操作成功");
    }
    if (/\/(valid|invalid)\//.test(url.pathname)) {
      assert.equal(request.method(), "POST");
      assert.equal(request.postData(), null);
      state.records.find((r) => r.id === Number(method)).enabled = url.pathname.includes("/valid/");
      return ok("操作成功");
    }
    throw new Error(`意外配置接口 ${url.pathname}`);
  });
  await page.goto(`${base}/sys/configs`);
  if (authenticated && admin)
    await page.getByRole("heading", { name: "系统配置管理", exact: true }).waitFor();
  return { page, state };
}
async function openDirty(page) {
  await button(page, "新增配置").click();
  await form(page).waitFor();
  await form(page).getByRole("textbox", { name: "名称", exact: true }).fill("草稿名称");
}
async function select(page, scope, label, value) {
  await scope.locator(`button[aria-label="${label}"]`).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
async function fill(page) {
  const scope = form(page);
  await scope.getByRole("textbox", { name: "配置键", exact: true }).fill("fixture.new &+#中文");
  await scope.getByRole("textbox", { name: "配置值", exact: true }).fill("  raw text  ");
}
for (const kind of ["取消", "X", "遮罩", "Escape"]) {
  test(`${kind} 两层确认：继续保留、放弃才关闭`, async (t) => {
    const { page } = await setup(t);
    await openDirty(page);
    const leave = async () => {
      if (kind === "取消") await button(form(page), "取消").click();
      else if (kind === "X") await button(form(page), "关闭").click();
      else if (kind === "Escape") await page.keyboard.press("Escape");
      else await page.mouse.click(2, 2);
    };
    await leave();
    await discard(page).waitFor();
    await button(discard(page), "继续编辑").click();
    assert.equal(
      await form(page).getByRole("textbox", { name: "名称", exact: true }).inputValue(),
      "草稿名称",
    );
    await leave();
    await button(discard(page), "放弃修改").click();
    await form(page).waitFor({ state: "hidden" });
  });
}
test("刷新和关闭触发原生 beforeunload，取消保留草稿", async (t) => {
  const { page } = await setup(t);
  await openDirty(page);
  let count = 0;
  page.on("dialog", async (dialog) => {
    assert.equal(dialog.type(), "beforeunload");
    count++;
    await dialog.dismiss();
  });
  await page.reload().catch((error) => {
    assert.match(String(error), /aborted|ERR_ABORTED|cancel/i);
  });
  assert.equal(count, 1);
  assert.equal(
    await form(page).getByRole("textbox", { name: "名称", exact: true }).inputValue(),
    "草稿名称",
  );
  await page.close({ runBeforeUnload: true });
  await page.waitForTimeout(200);
  assert.equal(count, 2);
  assert.equal(page.isClosed(), false);
});
test("菜单 Link 和浏览器后退/前进由真实 blocker 拦截", async (t) => {
  const { page } = await setup(t);
  await page.locator('a[href="/inbox"]').first().click();
  await page.waitForURL("**/inbox");
  await page.locator('a[href="/sys/configs"]').first().click();
  await page.waitForURL("**/sys/configs");
  await openDirty(page);
  await page.evaluate(() => history.back());
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  assert.match(page.url(), /sys\/configs/);
  await page.locator('a[href="/inbox"]').first().click({ force: true });
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  await page.evaluate(() => history.back());
  await button(discard(page), "放弃修改").click();
  await page.waitForURL("**/inbox");
  await page.evaluate(() => history.forward());
  await page.waitForURL("**/sys/configs");
  await page.locator('a[href="/inbox"]').first().click();
  await page.waitForURL("**/inbox");
  await page.evaluate(() => history.back());
  await page.waitForURL("**/sys/configs");
  await openDirty(page);
  await page.evaluate(() => history.forward());
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  assert.match(page.url(), /sys\/configs/);
});
test("失败保留 dirty；成功关闭顺序及重开布防，读回失败只重试读", async (t) => {
  const { page, state } = await setup(t);
  await openDirty(page);
  await fill(page);
  state.failSave = true;
  await button(form(page), "创建").click();
  await form(page).getByRole("alert").filter({ hasText: "fixture 请求失败" }).waitFor();
  await button(form(page), "取消").click();
  await discard(page).waitFor();
  await button(discard(page), "继续编辑").click();
  state.failSave = false;
  state.failRead = true;
  await button(form(page), "创建").click();
  await form(page).getByRole("alert").filter({ hasText: "已保存，读取验证失败" }).waitFor();
  assert.equal(state.writes.length, 2);
  state.failRead = false;
  await button(form(page), "重试读取验证").click();
  await form(page).waitFor({ state: "hidden" });
  assert.equal(state.writes.length, 2);
  await openDirty(page);
  await button(form(page), "取消").click();
  await discard(page).waitFor();
});
test("四种编辑形态与 String 载荷；boolean required/false 与 JSON 排版 dirty", async (t) => {
  for (const [type, value, expected] of [
    ["字符串", "raw text", "raw text"],
    ["数字（整数）", " +0000 ", "0"],
    ["布尔", "false", "false"],
    ["JSON", ' {"a":1} ', '{"a":1}'],
  ]) {
    const { page, state } = await setup(t);
    await openDirty(page);
    await fill(page);
    await select(page, form(page), "数据类型（必填）", type);
    if (type === "布尔") {
      await select(page, form(page), "配置值（必填）", value);
      assert.equal(
        await form(page)
          .locator('button[aria-label="配置值（必填）"]')
          .getAttribute("aria-required"),
        "true",
      );
    } else await form(page).getByRole("textbox", { name: "配置值", exact: true }).fill(value);
    await button(form(page), "创建").click();
    await form(page).waitFor({ state: "hidden" });
    assert.equal(state.writes[0].payload.configValue, expected);
    if (type === "JSON") {
      await page
        .getByRole("row")
        .filter({ has: page.getByText("草稿名称", { exact: true }) })
        .getByRole("button", { name: "编辑", exact: true })
        .click();
      const edit = page.getByRole("dialog", { name: "编辑配置", exact: true });
      await edit.getByRole("textbox", { name: "配置值", exact: true }).fill('{ "a": 1 }');
      await button(edit, "取消").click();
      await discard(page).waitFor();
    }
  }
});
test("非管理员管理请求为零", async (t) => {
  const { page, state } = await setup(t, { admin: false });
  await page.waitForURL("**/403");
  assert.equal(state.requests.filter((r) => r.path.includes("systemConfig")).length, 0);
});
