/**
 * Real mounted React + HeroUI in Chromium; all API responses are frontend fixtures.
 * No listener/dev server required: Vite bundles the test-only entry in memory.
 * pnpm exec node --test scripts/dynamic-buttons.browser.mjs
 * Optional P5_CHROMIUM_EXECUTABLE_PATH selects an already installed Chromium.
 * This cannot establish real backend filtering or authorization acceptance.
 */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { chromium } from "playwright";
let browser, script, css;
before(async () => {
  const bundle = await build({
    configFile: false,
    logLevel: "error",
    // Fixture-only: the app build supplies this define; without it `process`
    // stays a free variable and the bundle fails at load in the browser.
    // Exercise StrictMode's development mount/cleanup replay as well.
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    plugins: [react(), tailwind()],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL(
            "../src/components/biz/__tests__/dynamic-buttons.browser-fixture.tsx",
            import.meta.url,
          ),
        ),
        name: "DynamicButtonsFixture",
        formats: ["iife"],
      },
    },
  });
  const output = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((result) => result.output);
  script = output.find((item) => item.type === "chunk").code;
  css = output
    .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
    .map((item) => String(item.source))
    .join("\n");
  browser = await chromium.launch({
    executablePath: process.env.P5_CHROMIUM_EXECUTABLE_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});
after(async () => {
  await browser?.close();
});
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function eventually(check) {
  const deadline = Date.now() + 10000;
  let last;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw last;
}
async function setup(t, api) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  const requests = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/")
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><body><div id="root"></div></body></html>',
      });
    requests.push(url.pathname);
    if (api) return api(route, url);
    return route.fulfill({ status: 500, body: "Unexpected fixture request" });
  });
  await page.goto("http://dynamic-buttons.fixture/");
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => Boolean(window.dynamicButtonsFixture));
  const call = (method, arg) =>
    page.evaluate(({ method, arg }) => window.dynamicButtonsFixture[method](arg), { method, arg });
  return { page, requests, errors, call };
}
test("mounted subscription responds without remount; disabled blocks mouse/keyboard and preserves ref/style", async (t) => {
  const { page, call, requests, errors } = await setup(t);
  assert.equal(await button(page, "Direct").count(), 0);
  assert.equal(await page.getByText("denied fallback").count(), 1);
  await call("ready");
  await button(page, "Direct").waitFor();
  assert.equal(await call("hasRef"), true);
  assert.match(await button(page, "Direct").getAttribute("class"), /fixture-button/);
  await button(page, "Direct").click();
  await button(page, "Direct").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await eventually(async () => assert.deepEqual(await call("log"), ["direct", "direct", "direct"]));
  for (const status of ["loading", "ready", "error", "idle"]) {
    await call("status", status);
    await eventually(async () =>
      assert.equal(await button(page, "Direct").count(), status === "ready" ? 1 : 0),
    );
  }
  await call("update", { mode: "disabled" });
  assert.equal(await button(page, "Direct").isDisabled(), true);
  await button(page, "Direct").evaluate((el) => {
    el.click();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.keyboard.press("Space");
  assert.equal((await call("log")).length, 3);
  await call("ready");
  await call("update", { disabled: true });
  assert.equal(await button(page, "Direct").isDisabled(), true);
  await call("update", { disabled: false, pending: true });
  await button(page, "Direct").evaluate((el) => el.click());
  assert.equal((await call("log")).length, 3);
  await call("update", { pending: false, mode: "hidden" });
  await call("reset", null);
  await eventually(async () => assert.equal(await button(page, "Direct").count(), 0));
  await call("unmount");
  await call("ready");
  assert.equal(await page.locator("button").count(), 0);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});
test("append-only definitions, latest row context, visible, unavailable kinds and delayed revocation", async (t) => {
  const { page, call, requests, errors } = await setup(t);
  await call("ready", { codes: ["fixture:create", "fixture:edit", "fixture:wait"] });
  await button(page, "Registered create").waitFor();
  assert.equal(await button(page, "Registered edit").count(), 0);
  await call("append");
  await button(page, "Registered edit").waitFor();
  await call("update", { id: 2 });
  await button(page, "Registered create").click();
  await eventually(async () => assert.deepEqual(await call("log"), [2]));
  assert.equal(await page.getByTestId("unavailable").locator("button").count(), 0);
  await call("update", { mode: "disabled" });
  assert.equal(await page.getByTestId("unavailable").locator("button").isDisabled(), true);
  for (const change of ["permission", "session", "visible", "disabled"]) {
    await call("update", { mode: "hidden", visible: true, disabled: false });
    await call("ready", { codes: ["fixture:create", "fixture:edit", "fixture:wait"] });
    await page.getByTestId("delayed").getByRole("button").click();
    if (change === "permission") await call("ready", { authorities: [] });
    if (change === "session") await call("ready", { userId: "8", generation: 4 });
    if (change === "visible") await call("update", { visible: false });
    if (change === "disabled") await call("update", { disabled: true });
    await call("resume");
    assert.deepEqual(await call("log"), [2]);
  }
  await call("ready", { authorities: [] });
  await call("update", { visible: true, disabled: false, mode: "hidden" });
  assert.equal(await button(page, "Registered create").count(), 0);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
});

test("delayed effects stop after unmount and action failures reach the page error callback", async (t) => {
  const { page, call, requests, errors } = await setup(t);
  await call("ready", {
    codes: [
      "fixture:wait",
      "fixture:sync-failure",
      "fixture:async-failure",
      "fixture:executor-failure",
    ],
  });
  await button(page, "Sync failure").click();
  await button(page, "Async failure").click();
  await button(page, "Executor failure").click();
  await eventually(async () =>
    assert.deepEqual(await call("errors"), [
      "Error: fixture synchronous failure",
      "Error: fixture asynchronous failure",
      "Error: fixture executor failure",
    ]),
  );
  await button(page, "Delayed").click();
  await call("unmount");
  await call("resume");
  assert.deepEqual(await call("log"), []);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []); // No unhandled rejection/pageerror.
});

function menu(code, id) {
  return {
    id,
    parentId: null,
    name: code,
    type: 3,
    permission: code,
    path: null,
    icon: null,
    openType: 1,
    uri: null,
    sort: 0,
    hidden: false,
    keepAlive: null,
    memo: null,
    createdAt: null,
    updatedAt: null,
  };
}
const role = {
  id: 12,
  roleName: "Fixture role",
  roleCode: "FIXTURE",
  description: "",
  enabled: true,
  createdAt: null,
  updatedAt: null,
};
test("actual roles/dialogs and successful permission-tree save refresh mounted buttons; drafts/failures preserve grants", async (t) => {
  const state = { ids: [91, 92], fail: false, posts: [] };
  const api = async (route, url) => {
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    if (url.pathname.endsWith("/auth/v1/me"))
      return ok({
        userId: "7",
        userName: "fixture",
        cnName: null,
        extraInfo: {},
        roles: ["TEST"],
        authorities: [
          "system:admin",
          ...state.ids.map((id) => (id === 91 ? "role:create" : "role:edit")),
        ],
      });
    if (url.pathname.endsWith("/menu/v1/getMenuTreeByUser"))
      return ok([menu("role:create", 1), menu("role:edit", 2)]);
    if (url.pathname.endsWith("/role/v1/findByPage"))
      return ok({ list: [role], total: 1, pageNumber: 1, pageSize: 100 });
    if (url.pathname.endsWith("/role/v1/findById/12")) return ok(role);
    if (url.pathname.endsWith("/role/v1/list")) return ok([role]);
    if (url.pathname.endsWith("/permission/v1/tree"))
      return ok(
        [91, 92].map((id) => ({
          id,
          permissionName: id === 91 ? "Fixture create" : "Fixture edit",
          permissionCode: id === 91 ? "role:create" : "role:edit",
          permissionType: "BUTTON",
          groupName: "Fixture",
          enabled: true,
        })),
      );
    if (url.pathname.endsWith("/role/v1/permissions/12")) return ok(state.ids);
    if (url.pathname.endsWith("/role/v1/assignPermissions")) {
      const payload = route.request().postDataJSON();
      state.posts.push(payload);
      if (state.fail)
        return route.fulfill({
          status: 500,
          json: { code: 500, msg: "Fixture save failure", result: null },
        });
      state.ids = payload.permissionIds;
      return ok("权限分配成功");
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const { page, call, requests, errors } = await setup(t, api);
  await call("signIn");
  await call("update", { view: "roles" });
  await button(page, "编辑").waitFor();
  assert.equal(await button(page, "新增角色").count(), 1);
  assert.equal(await button(page, "编辑").count(), 1);
  assert.equal(await button(page, "分配权限").count(), 1);
  assert.equal(await button(page, "分配权限").isEnabled(), true);
  await button(page, "新增角色").click();
  const create = page.getByRole("dialog", { name: "新增角色", exact: true });
  await create.getByRole("textbox", { name: "角色名称" }).fill("dirty fixture");
  await call("ready", {
    codes: ["role:create", "role:edit"],
    authorities: ["role:edit"],
    generation: (await call("snapshot")).sessionGeneration,
  });
  assert.equal(
    await create.getByRole("textbox", { name: "角色名称" }).inputValue(),
    "dirty fixture",
  );
  await create.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .getByRole("dialog", { name: "是否放弃修改？" })
    .getByRole("button", { name: "放弃修改", exact: true })
    .click();
  await button(page, "编辑").click();
  const edit = page.getByRole("dialog", { name: "编辑角色" });
  await eventually(async () =>
    assert.equal(await edit.getByRole("textbox", { name: "角色名称" }).inputValue(), role.roleName),
  );
  assert.ok(requests.includes("/api/role/v1/findById/12"));
  await edit.getByRole("button", { name: "取消", exact: true }).click();
  await button(page, "分配权限").click();
  await eventually(() => assert.equal(new URL(page.url()).pathname, "/sys/roles/12/permissions"));
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(state.posts, []);
  await call("signIn");
  await call("update", { view: "assignment" });
  const leaf = (name) => page.getByRole("checkbox", { name: new RegExp(`选择权限 ${name}`) });
  await leaf("Fixture create").waitFor();
  const before = requests.filter((path) => path === "/api/auth/v1/me").length;
  await leaf("Fixture create").uncheck();
  assert.equal(await button(page, "新增角色").count(), 1);
  assert.equal(requests.filter((path) => path === "/api/auth/v1/me").length, before);
  state.fail = true;
  await button(page, "保存分配").click();
  await page.getByText(/Fixture save failure/).waitFor();
  assert.equal(await button(page, "新增角色").count(), 1);
  state.fail = false;
  await button(page, "保存分配").click();
  await eventually(async () => {
    assert.equal((await call("snapshot")).status, "ready");
    assert.equal(await button(page, "新增角色").count(), 0);
  });
  assert.deepEqual(state.posts.at(-1), { roleId: 12, permissionIds: [92] });
  assert.equal(await button(page, "编辑").count(), 1);
  await leaf("Fixture create").check();
  await button(page, "保存分配").click();
  await button(page, "新增角色").waitFor();
  await leaf("Fixture edit").uncheck();
  await button(page, "保存分配").click();
  await eventually(async () => assert.equal(await button(page, "编辑").count(), 0));
  await leaf("Fixture create").uncheck();
  await button(page, "保存分配").click();
  await eventually(async () => assert.equal(await button(page, "新增角色").count(), 0));
  assert.deepEqual((await call("snapshot")).grantedCodes, []); // system:admin still exists
  assert.equal(await button(page, "分配权限").count(), 1);
  assert.equal(await button(page, "分配权限").isEnabled(), true);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.ok(
    !requests.some((path) =>
      /checkMenuPermission|menu\/v1\/findByPage|permission\/v1\/findByPage/.test(path),
    ),
  );
  assert.deepEqual(errors, []);
});
