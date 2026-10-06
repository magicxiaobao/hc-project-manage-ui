/** Frontend fixture acceptance only. Run against an existing dev/preview server:
 * P5_BROWSER_BASE_URL=http://127.0.0.1:8080 node scripts/workflow-designer.browser.mjs
 * No backend integration is claimed. Browser/port availability is required.
 */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const base = process.env.P5_BROWSER_BASE_URL ?? "http://127.0.0.1:8080";
const key = "hc-project-manage-ui:workflow-designer:v1:1";
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
const button = (page, name) => page.getByRole("button", { name, exact: true });
const modal = (page) => page.getByRole("dialog", { name: "确认操作", exact: true });
const canvas = (page) => page.getByRole("group", { name: "工作流画布", exact: true });
const field = (page, name) => page.getByRole("textbox", { name, exact: true });
const property = (page) => page.getByRole("complementary", { name: "属性面板" });
const states = (page) => page.getByRole("complementary", { name: "状态面板" });
const dirty = (page) => page.locator("[data-workflow-dirty]");
const graph = (nodes = [], edges = []) => ({
  format: "hc-workflow-designer",
  version: 1,
  graph: { nodes, edges },
});
const node = (id, x = 0, y = 0) => ({
  id,
  type: "state",
  position: { x, y },
  label: `状态 ${id}`,
  description: "",
});
const edge = (id, source, target) => ({
  id,
  source,
  target,
  label: `流转 ${id}`,
  event: "transition",
  condition: '中文 "条件"\n不执行()',
});
async function setup(t, { authenticated = true, admin = true, granted = false, raw = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  t.after(() => context.close());
  const user = {
    userId: "1",
    userName: "浏览器夹具",
    cnName: null,
    extraInfo: {},
    roles: [],
    authorities: admin ? ["system:admin"] : granted ? ["fixture:workflow:view"] : [],
  };
  await context.addInitScript(
    ({ authenticated, user, raw, key }) => {
      // Init once per fresh context; reload must recover the actual successful save.
      if (!sessionStorage.getItem("workflow-fixture-init")) {
        if (authenticated) {
          localStorage.setItem("token", "fixture-access");
          localStorage.setItem("refreshToken", "fixture-refresh");
          localStorage.setItem("userInfo", JSON.stringify(user));
        }
        if (raw !== null) localStorage.setItem(key, raw);
        sessionStorage.setItem("workflow-fixture-init", "1");
      }
    },
    { authenticated, user, raw, key },
  );
  const page = await context.newPage(),
    requests = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${path}`);
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    if (path.endsWith("/auth/v1/me")) return ok(user);
    if (path.endsWith("/menu/v1/getMenuTreeByUser"))
      return ok(
        granted
          ? [
              {
                id: 9,
                parentId: 0,
                type: 2,
                name: "工作流设计器",
                path: "/system/workflow-designer",
                openType: 1,
                permission: "fixture:workflow:view",
                sort: 0,
                hidden: false,
                icon: null,
                uri: null,
                keepAlive: null,
                memo: null,
                createdAt: null,
                updatedAt: null,
              },
            ]
          : [],
      );
    if (/avatar\/content$/.test(path)) return route.fulfill({ status: 404, body: "" });
    return ok([]);
  });
  await page.goto(`${base}/sys/workflow-designer`);
  if (authenticated && (admin || granted)) {
    await page.getByRole("heading", { name: "工作流设计器", exact: true }).waitFor();
    await button(page, "添加状态").waitFor();
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="状态面板"] button')?.disabled,
    );
  }
  return { page, requests, context };
}
async function confirm(page) {
  await button(modal(page), "确定").click();
  await modal(page).waitFor({ state: "hidden" });
}
async function cancel(page, kind = "button") {
  if (kind === "Esc") await page.keyboard.press("Escape");
  else if (kind === "X") await button(modal(page), "关闭").click();
  else if (kind === "backdrop") await page.mouse.click(2, 2);
  else await button(modal(page), "继续编辑").click();
  await modal(page).waitFor({ state: "hidden" });
}
async function exportGraph(page) {
  const wait = page.waitForEvent("download");
  await button(page, "导出 JSON").click();
  const download = await wait;
  assert.equal(download.suggestedFilename(), "workflow-graph.json");
  return JSON.parse(await readFile(await download.path(), "utf8"));
}
async function upload(page, file) {
  await page.getByLabel("选择工作流 JSON 文件").setInputFiles({
    name: "workflow-graph.json",
    mimeType: "application/json",
    buffer: Buffer.from(typeof file === "string" ? file : JSON.stringify(file)),
  });
}
async function choose(page, id) {
  await canvas(page).locator(`[data-node-id="${id}"]`).press("Enter");
}
async function position(page, id) {
  return canvas(page).locator(`[data-node-id="${id}"]`).getAttribute("transform");
}
async function drag(page, id, dx, dy, cancelWith) {
  const box = await canvas(page).locator(`[data-node-id="${id}"] rect`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 });
  if (cancelWith === "Esc") await page.keyboard.press("Escape");
  if (cancelWith === "pointercancel")
    await canvas(page).dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
}
test("login/403/ordinary alias menu/admin obey existing authorization", async (t) => {
  for (const mode of [
    { authenticated: false },
    { admin: false },
    { admin: false, granted: true },
    { admin: true },
  ]) {
    const { page } = await setup(t, mode);
    if (mode.authenticated === false) await page.waitForURL("**/login?**");
    else if (mode.admin === false && !mode.granted) await page.waitForURL("**/403");
    else await canvas(page).waitFor();
  }
});
test("all field errors, clear only edited field, cancel/selection prompts keep draft and page guard", async (t) => {
  const { page } = await setup(t);
  await button(page, "添加状态").click();
  await button(page, "添加状态").click();
  const ids = await canvas(page)
    .locator("[data-node-id]")
    .evaluateAll((el) => el.map((e) => e.dataset.nodeId));
  await field(page, "状态名称").fill("");
  await field(page, "X").fill("");
  await field(page, "Y").fill("Infinity");
  await button(page, "应用属性").click();
  assert.equal(await property(page).getByRole("alert").count(), 3);
  assert.equal(await property(page).locator(".sr-only").filter({ hasText: "（必填）" }).count(), 3);
  await field(page, "状态名称").fill("新状态");
  assert.equal(await property(page).getByRole("alert").count(), 2);
  for (const kind of ["button", "X", "Esc", "backdrop"]) {
    await states(page).getByRole("button", { name: "状态 1", exact: true }).click();
    await modal(page).waitFor();
    await cancel(page, kind);
    assert.equal(await field(page, "状态名称").inputValue(), "新状态");
  }
  await button(page, "取消编辑").click();
  await cancel(page);
  await states(page).getByRole("button", { name: "状态 1", exact: true }).click();
  await confirm(page);
  assert.match(await position(page, ids[1]), /translate/);
  assert.equal(await dirty(page).getAttribute("data-workflow-dirty"), "true");
});
test("zoom + pan drag uses graph coordinates, preview conflicts disabled, Esc/pointercancel abort", async (t) => {
  const original = graph(
    [node("a", 0, 0), node("b", 320, 80)],
    [edge("ab", "a", "b"), edge("ba", "b", "a")],
  );
  const { page } = await setup(t, { raw: JSON.stringify(original) });
  await choose(page, "a");
  await button(page, "放大").click();
  await button(page, "平移模式").click();
  const box = await canvas(page).boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height - 10);
  await page.mouse.up();
  await button(page, "平移模式").click();
  const zoom = await canvas(page)
    .locator("[data-graph-layer]")
    .evaluate((e) => e.transform.baseVal.getItem(1).matrix.a);
  await drag(page, "a", 44, 22);
  const moved = (await exportGraph(page)).graph.nodes[0].position;
  assert.ok(Math.abs(moved.x - 44 / zoom) < 0.01);
  assert.ok(Math.abs(moved.y - 22 / zoom) < 0.01);
  const before = await position(page, "a");
  await drag(page, "a", 55, 33, "Esc");
  assert.equal(await position(page, "a"), before);
  await choose(page, "a");
  await drag(page, "a", 55, 33, "pointercancel");
  assert.equal(await position(page, "a"), before);
  const rect = await canvas(page).locator('[data-node-id="a"] rect').boundingBox();
  await page.mouse.move(rect.x + 20, rect.y + 20);
  await page.mouse.down();
  await page.mouse.move(rect.x + 80, rect.y + 20);
  assert.equal(await button(page, "保存到本机").isDisabled(), true);
  assert.equal(await button(page, "导出 JSON").isDisabled(), true);
  await page.mouse.up();
  assert.equal(await canvas(page).locator("[data-edge-id]").count(), 2);
});
test("connection constraints and keyboard delete; input Delete/Backspace and modal Esc never delete", async (t) => {
  const { page } = await setup(t, { raw: JSON.stringify(graph([node("a"), node("b", 300, 100)])) });
  await button(page, "添加流转").click();
  await choose(page, "a");
  await choose(page, "a");
  await page.getByText(/禁止自连/).waitFor();
  assert.equal(await canvas(page).locator("[data-edge-id]").count(), 0);
  await choose(page, "b");
  assert.equal(await canvas(page).locator("[data-edge-id]").count(), 1);
  await button(page, "添加流转").click();
  await choose(page, "a");
  await choose(page, "b");
  await page.getByText(/同方向流转重复/).waitFor();
  await button(page, "取消连线").click();
  await choose(page, "a");
  await field(page, "状态名称").press("Delete");
  await field(page, "状态名称").press("Backspace");
  assert.equal(await canvas(page).locator("[data-node-id]").count(), 2);
  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await modal(page)
    .getByText(/1 条关联流转/)
    .waitFor();
  await cancel(page, "Esc");
  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await confirm(page);
  assert.equal(await canvas(page).locator("[data-node-id]").count(), 1);
  assert.equal(await canvas(page).locator("[data-edge-id]").count(), 0);
});
test("download/upload exact round-trip, broken and canceled/repeated imports, save + reload recovery", async (t) => {
  const original = graph(
    [node("a", -20, 15), node("b", 300, 140)],
    [edge("ab", "a", "b"), edge("ba", "b", "a")],
  );
  original.graph.nodes[0].description = '中文"描述"\n原文';
  const { page, requests } = await setup(t, { raw: JSON.stringify(original) });
  const startRequests = requests.length;
  assert.deepEqual(await exportGraph(page), original);
  await upload(page, "bad JSON");
  await page.getByText(/JSON 解析失败/).waitFor();
  assert.deepEqual(await exportGraph(page), original);
  await upload(page, graph());
  await modal(page).waitFor();
  await cancel(page);
  assert.deepEqual(await exportGraph(page), original);
  await button(page, "清空").click();
  await confirm(page);
  await upload(page, original);
  await canvas(page).locator('[data-node-id="a"]').waitFor();
  assert.deepEqual(await exportGraph(page), original);
  await choose(page, "a");
  await field(page, "状态名称").fill("已保存");
  await button(page, "保存到本机").click();
  await page.reload();
  await canvas(page).locator('[data-node-id="a"]').waitFor();
  await choose(page, "a");
  assert.equal(await field(page, "状态名称").inputValue(), "已保存");
  assert.equal(await dirty(page).getAttribute("data-workflow-dirty"), "false");
  assert.equal(
    requests.slice(startRequests).some((p) => /workflow|design/i.test(p)),
    false,
  );
  assert.deepEqual(
    requests
      .slice(startRequests)
      .filter((p) => !/\/auth\/v1\/me$|\/menu\/v1\/getMenuTreeByUser$|\/avatar\/content$/.test(p)),
    [],
  );
});
test("bad storage overwrite canceled/confirmed; quota failure keeps draft and allows export", async (t) => {
  const { page } = await setup(t, { raw: "broken" });
  await page.getByText(/当前以空图作为干净快照/).waitFor();
  await button(page, "添加状态").click();
  await field(page, "状态名称").fill("候选草稿");
  await button(page, "保存到本机").click();
  await cancel(page);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), "broken");
  assert.equal(await field(page, "状态名称").inputValue(), "候选草稿");
  await button(page, "保存到本机").click();
  await confirm(page);
  assert.equal(await dirty(page).getAttribute("data-workflow-dirty"), "false");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.includes("workflow-designer")) throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, k, v);
    };
  });
  await field(page, "状态名称").fill("失败仍保留");
  await button(page, "保存到本机").click();
  await page.getByText(/未保存，可导出 JSON 备份/).waitFor();
  assert.equal(await field(page, "状态名称").inputValue(), "失败仍保留");
  assert.equal((await exportGraph(page)).graph.nodes[0].label, "失败仍保留");
  assert.equal(await dirty(page).getAttribute("data-workflow-dirty"), "true");
});
test("route back keep/discard, beforeunload, saved then edited rearms protection", async (t) => {
  const { page } = await setup(t);
  await page.goto(`${base}/sys/profile`);
  await page.goto(`${base}/sys/workflow-designer`);
  await button(page, "添加状态").click();
  await button(page, "保存到本机").click();
  await field(page, "状态名称").fill("");
  const back = page.goBack();
  const discard = page.getByRole("dialog", { name: "是否放弃修改？", exact: true });
  await discard.waitFor();
  await button(discard, "继续编辑").click();
  await back;
  assert.equal(new URL(page.url()).pathname, "/sys/workflow-designer");
  const prompt = page.waitForEvent("dialog");
  const reload = page.reload().catch(() => {});
  const native = await prompt;
  assert.equal(native.type(), "beforeunload");
  await native.dismiss();
  await reload;
  const leave = page.goBack();
  await discard.waitFor();
  await button(discard, "放弃修改").click();
  await leave;
  await page.waitForURL("**/sys/profile");
});
test("canceled and account-stale asynchronous reads cannot replace a newer session", async (t) => {
  const { page } = await setup(t);
  await page.evaluate(() => {
    window.__workflowPending = [];
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve) => window.__workflowPending.push(resolve));
    };
  });
  await upload(page, graph([node("old")]));
  await button(page, "取消导入").waitFor();
  assert.equal(await button(page, "添加状态").isDisabled(), true);
  await button(page, "取消导入").click();
  await button(page, "添加状态").click();
  await page.evaluate(
    (file) => {
      window.__workflowPending.shift()(new TextEncoder().encode(JSON.stringify(file)).buffer);
    },
    graph([node("old")]),
  );
  assert.equal(await canvas(page).locator('[data-node-id="old"]').count(), 0);
  await upload(page, graph([node("old")]));
  await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem("userInfo"));
    user.userId = "2";
    localStorage.setItem("userInfo", JSON.stringify(user));
    window.dispatchEvent(new StorageEvent("storage", { key: "userInfo" }));
  });
  await page.evaluate(
    (file) => {
      window.__workflowPending.shift()(new TextEncoder().encode(JSON.stringify(file)).buffer);
    },
    graph([node("old")]),
  );
  assert.equal(await canvas(page).locator('[data-node-id="old"]').count(), 0);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
});
