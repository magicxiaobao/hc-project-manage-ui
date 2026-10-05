/**
 * p3-task-dependencies 真实浏览器交互（mock 网络信封，不宣称真实后端持久化）。
 * 先 pnpm dev，再：node --test scripts/task-dependencies.browser.mjs
 * 可传 P3_BROWSER_URL / P3_CHROMIUM_EXECUTABLE；默认只访问 loopback。
 * 复用已安装 playwright 与 node:test，不新增依赖。
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const base = checkedUrl(process.env.P3_BROWSER_URL || "http://127.0.0.1:8080");
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.P3_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.P3_CHROMIUM_EXECUTABLE }
    : {}),
});
after(() => browser.close());
const edge = (id, predecessorId = 1, successorId = 2, overrides = {}) => ({
  id,
  projectId: 7,
  predecessorId,
  successorId,
  dependencyType: "finish-to-start",
  lag: 0,
  description: null,
  status: "ACTIVE",
  createdAt: null,
  updatedAt: null,
  ...overrides,
});
const taskRow = (id, overrides = {}) => ({
  id,
  projectId: 7,
  title: `任务${id}`,
  status: "TODO",
  priority: "MEDIUM",
  description: null,
  taskType: "开发",
  sprintId: null,
  assigneeId: 1,
  reporterId: 1,
  storyPoints: null,
  progress: 0,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});
const circularItems = () =>
  [12, 13].map((dependencyId) => ({
    dependencyId,
    type: "循环依赖",
    title: "检测到循环依赖",
    description: `异常边 #${dependencyId}`,
  }));
const pageResult = (rows, body) => ({
  list: rows.slice((body.page - 1) * body.pageSize, body.page * body.pageSize),
  total: rows.length,
  pageSize: body.pageSize,
  pageNumber: body.page,
});
const wait = async (check) => {
  for (let n = 0; n < 100; n++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("等待断言超时");
};
const visible = (locator) => wait(() => locator.isVisible());
async function fixture(fn, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const state = {
    rows: [edge(11)],
    calls: [],
    circular: false,
    conflicts: [],
    listFailure: false,
    statisticsFailure: false,
    candidateFailure: false,
    checkFailure: false,
    createFailure: false,
    batchFailure: false,
    conflictFailure: false,
    holdCheck: null,
    holdCreate: null,
    tasks: Array.from({ length: 501 }, (_, i) => taskRow(i + 1)),
    ...options,
  };
  await page.addInitScript(() => {
    localStorage.setItem("token", "p3-browser-fixture");
    localStorage.setItem(
      "userInfo",
      JSON.stringify({ userId: "1", userName: "测试用户", cnName: "测试用户", roles: ["ADMIN"] }),
    );
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = request.postDataJSON();
    state.calls.push({ path, method: request.method(), body });
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    const fail = (message) =>
      route.fulfill({ status: 200, json: { code: 40001, msg: message, result: null } });
    if (path === "/api/project/v1/findByPage")
      return ok(
        pageResult(
          [
            {
              id: body.bean?.projectKey === "OTHER" ? 8 : 7,
              projectKey: body.bean?.projectKey || "P3",
              projectName: "测试项目",
            },
          ],
          body,
        ),
      );
    if (path === "/api/task/v1/findByPage")
      return state.candidateFailure
        ? fail("候选失败")
        : ok(
            pageResult(
              state.tasks.filter((task) => task.projectId === body.bean.projectId),
              body,
            ),
          );
    if (path === "/api/taskDependency/v1/findByPage")
      return state.listFailure
        ? fail("列表读取失败")
        : ok(
            pageResult(
              state.rows.filter((row) => row.projectId === body.bean.projectId),
              body,
            ),
          );
    if (path === "/api/taskDependency/v1/getStatistics")
      return state.statisticsFailure
        ? route.fulfill({ status: 403, json: { code: 403, msg: "无统计权限", result: null } })
        : ok(
            state.statistics || {
              totalDependencies: state.rows.length,
              conflicts: state.conflicts.length,
              circularDependencies: state.conflicts.length,
            },
          );
    if (path === "/api/taskDependency/v1/detectConflicts")
      return state.conflictFailure ? fail("检测失败") : ok(state.conflicts);
    if (path === "/api/taskDependency/v1/checkCircularDependency") {
      if (state.holdCheck) await state.holdCheck;
      return state.checkFailure ? fail("检查业务失败") : ok(state.circular);
    }
    if (path === "/api/taskDependency/v1/createTaskDependency") {
      if (state.holdCreate) await state.holdCreate;
      if (state.createFailure) return fail("并发变更：依赖重复或已成环");
      const id = Math.max(0, ...state.rows.map((row) => row.id)) + 1;
      // 仅测试 UI 权威重读，不作为 MapStruct 持久化证据。
      state.rows.push(edge(id, body.predecessorId, body.successorId, body));
      if (state.failReadAfterCreate) state.listFailure = true;
      return ok(id);
    }
    if (/\/taskDependency\/v1\/invalid\//.test(path)) {
      state.rows = state.rows.map((row) =>
        row.id === Number(path.split("/").at(-1)) ? { ...row, status: "INACTIVE" } : row,
      );
      return ok("ok");
    }
    if (path === "/api/taskDependency/v1/batchDelete") {
      if (state.batchFailure) return fail("批删失败");
      state.rows = state.rows.filter((row) => !body.ids.includes(row.id));
      return ok("批量删除成功");
    }
    if (/\/taskDependency\/v1\/get(Predecessors|Successors)\//.test(path)) {
      const id = Number(path.split("/").at(-1));
      const endpoint = path.includes("getPredecessors") ? "successorId" : "predecessorId";
      if (state.sidebarFailure === endpoint) return fail("侧栏失败");
      return ok(state.rows.filter((row) => row.status === "ACTIVE" && row[endpoint] === id));
    }
    if (/\/task\/v1\/findById\//.test(path))
      return ok(
        state.tasks.find((task) => task.id === Number(path.split("/").at(-1))) || taskRow(1),
      );
    if (/\/comment\/v1\//.test(path))
      return ok({ list: [], total: 0, pageNumber: 1, pageSize: 50 });
    if (/\/task\/v1\/gantt\//.test(path))
      return ok({
        data: state.tasks.slice(0, 3).map((task) => ({
          id: task.id,
          text: task.title,
          start_date: "2026-10-01",
          end_date: "2026-10-03",
          duration: 2,
          progress: 0,
        })),
        links: state.rows
          .filter((row) => row.status === "ACTIVE")
          .map((row) => ({
            id: row.id,
            source: row.predecessorId,
            target: row.successorId,
            type: "0",
          })),
      });
    if (/\/task\/v1\/criticalPath\//.test(path))
      return ok({ criticalTasks: [], criticalPath: [], projectDuration: 0 });
    if (/\/milestone\/list\//.test(path)) return ok([]);
    if (/\/task\/v1\/dependencies\//.test(path)) return ok({ predecessors: [], successors: [] });
    if (path.includes("/auth/get-session")) return ok(null);
    return ok({ list: [], total: 0, pageNumber: 1, pageSize: 20 });
  });
  try {
    await page.goto(`${base}/p/P3/dependencies`);
    await visible(page.getByRole("heading", { name: "任务依赖关系管理", exact: true }));
    await visible(page.getByRole("button", { name: "新建依赖", exact: true }));
    await fn(page, state);
  } finally {
    await context.close();
  }
}
const calls = (state, suffix) => state.calls.filter((call) => call.path.endsWith(suffix));
async function openForm(page) {
  await page.getByRole("button", { name: "新建依赖", exact: true }).click();
  return page.getByRole("dialog", { name: "新建任务依赖", exact: true });
}
async function choose(page, label, text) {
  await page.getByRole("button", { name: new RegExp(`${label}$`) }).click();
  await page.getByRole("searchbox", { name: `筛选${label}`, exact: true }).fill(text);
  const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("option", { name: new RegExp("^" + escapedText + "(?: |$)") }).click();
}
async function endpoints(page, a = "#1 任务1", b = "#3 任务3") {
  await choose(page, "前置任务", a);
  await choose(page, "后置任务", b);
}
async function abandon(page) {
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
}

// 每个用例使用独立浏览器上下文、路由和网络状态，禁止把 SSR 输出当成交互。
test("全页读取、后续页过滤、当前页全选与切页清选", () =>
  fixture(
    async (page, state) => {
      await visible(page.locator('[data-dependency-id="201"]'));
      assert.equal(
        calls(state, "/findByPage").filter((call) => call.path.includes("taskDependency")).length,
        2,
      );
      await page.getByRole("checkbox", { name: "全选当前页" }).check();
      assert.equal(await page.locator('tbody input[type="checkbox"]:checked').count(), 20);
      await page.getByRole("button", { name: "下一页", exact: true }).click();
      await visible(page.getByText("已选 0 条", { exact: true }));
      await choose(page, "筛选依赖类型", "开始-开始（SS）");
      await choose(page, "筛选状态", "已作废");
      assert.equal(await page.locator("[data-dependency-id]").count(), 1);
      assert.equal(
        await page.locator("[data-dependency-id]").getAttribute("data-dependency-id"),
        "201",
      );
    },
    {
      rows: Array.from({ length: 201 }, (_, i) =>
        edge(
          i + 1,
          1,
          2,
          i === 200 ? { dependencyType: "start-to-start", status: "INACTIVE" } : {},
        ),
      ),
    },
  ));

test("首次失败重试、后台失败保留列表及已输入弹窗", () =>
  fixture(
    async (page, state) => {
      await visible(page.getByText(/依赖加载失败/));
      state.listFailure = false;
      await page.getByRole("button", { name: "重试列表" }).click();
      await visible(page.locator('[data-dependency-id="11"]'));
      const dialog = await openForm(page);
      await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("保留草稿");
      state.listFailure = true;
      // 触发真实 React Query 的后台刷新；弹窗不卸载。
      await page
        .getByRole("button", { name: "刷新", exact: true })
        .evaluate((button) => button.click());
      await wait(() => page.getByText(/后台刷新失败/).count());
      assert.equal(
        await dialog.getByRole("textbox", { name: "描述", exact: true }).inputValue(),
        "保留草稿",
      );
      assert.equal(await page.locator('[data-dependency-id="11"]').count(), 1);
    },
    { listFailure: true },
  ));

test("四个必填标记、全部字段错误、编辑只清相关错误、无请求", () =>
  fixture(async (page, state) => {
    const dialog = await openForm(page);
    assert.equal(await dialog.locator('.text-danger[aria-hidden="true"]').count(), 4);
    await dialog
      .locator('[data-field="dependencyType"]')
      .getByRole("button", { name: "清除", exact: true })
      .click();
    await dialog.getByRole("textbox", { name: /延迟天数/ }).fill("-1");
    await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("字".repeat(1001));
    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    assert.equal(await dialog.locator('[data-field] [role="alert"]').count(), 5);
    await dialog.getByRole("textbox", { name: /延迟天数/ }).fill("0");
    assert.equal(await dialog.locator('[data-field] [role="alert"]').count(), 4);
    assert.equal(calls(state, "/checkCircularDependency").length, 0);
    assert.equal(calls(state, "/createTaskDependency").length, 0);
  }));

test("候选第二页可选、互斥同值、其它项目不能选择", () =>
  fixture(
    async (page, state) => {
      await openForm(page);
      await endpoints(page, "#501 任务501", "#1 任务1");
      assert.equal(
        calls(state, "/findByPage").filter((call) => call.path === "/api/task/v1/findByPage")
          .length,
        2,
      );
      await page.getByRole("button", { name: /后置任务$/ }).click();
      await page.getByRole("searchbox", { name: "筛选后置任务", exact: true }).fill("#501");
      assert.equal(
        await page.getByRole("option", { name: "#501 任务501", exact: true }).count(),
        0,
      );
      await page.getByRole("searchbox", { name: "筛选后置任务", exact: true }).fill("其它项目任务");
      assert.equal(await page.getByRole("option", { name: /其它项目任务/ }).count(), 0);
    },
    {
      tasks: [
        ...Array.from({ length: 501 }, (_, i) => taskRow(i + 1)),
        taskRow(999, { projectId: 8, title: "其它项目任务" }),
      ],
    },
  ));

test("候选加载失败独立重试并禁止提交", () =>
  fixture(
    async (page, state) => {
      const dialog = await openForm(page);
      await visible(dialog.getByText(/候选任务加载失败/));
      assert.equal(
        await dialog.getByRole("button", { name: "创建", exact: true }).isDisabled(),
        true,
      );
      state.candidateFailure = false;
      await dialog.getByRole("button", { name: "重试候选任务" }).click();
      await wait(
        async () => !(await dialog.getByRole("button", { name: "创建", exact: true }).isDisabled()),
      );
    },
    { candidateFailure: true },
  ));

for (const field of ["predecessorId", "successorId", "dependencyType", "lag", "description"]) {
  test(`dirty 快照：修改 ${field}、继续编辑保留、放弃重置`, () =>
    fixture(async (page) => {
      const dialog = await openForm(page);
      if (field === "predecessorId") await choose(page, "前置任务", "#1 任务1");
      else if (field === "successorId") await choose(page, "后置任务", "#2 任务2");
      else if (field === "dependencyType") await choose(page, "依赖类型", "开始-开始（SS）");
      else
        await dialog
          .getByRole("textbox", { name: field === "lag" ? /延迟天数/ : "描述" })
          .fill(field === "lag" ? "3" : "草稿");
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      await visible(page.getByRole("dialog", { name: "是否放弃修改？" }));
      await page.getByRole("button", { name: "继续编辑" }).click();
      assert.equal(await dialog.isVisible(), true);
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      await abandon(page);
      const fresh = await openForm(page);
      assert.equal(await fresh.getByRole("textbox", { name: /延迟天数/ }).inputValue(), "0");
      assert.equal(
        await fresh.getByRole("textbox", { name: "描述", exact: true }).inputValue(),
        "",
      );
    }));
}
for (const exit of ["X", "遮罩", "Esc", "导航", "后退"]) {
  test(`dirty 离开入口 ${exit}`, () =>
    fixture(async (page) => {
      // 后退需要同 origin 的真实 history 项。
      if (exit === "后退") {
        await page.locator('[data-dependency-id="11"]').getByRole("link").first().click();
        await page.getByRole("link", { name: "管理依赖", exact: true }).click();
      }
      const dialog = await openForm(page);
      await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("草稿");
      if (exit === "X") await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      if (exit === "遮罩") await page.mouse.click(3, 3);
      if (exit === "Esc") await page.keyboard.press("Escape");
      if (exit === "导航")
        await page
          .locator('[data-dependency-id="11"]')
          .getByRole("link")
          .first()
          .evaluate((link) => link.click());
      if (exit === "后退") await page.evaluate(() => history.back());
      await visible(page.getByRole("dialog", { name: "是否放弃修改？" }));
      await page.getByRole("button", { name: "继续编辑" }).click();
      assert.equal(
        await dialog.getByRole("textbox", { name: "描述", exact: true }).inputValue(),
        "草稿",
      );
    }));
}
test("恢复原值直接关闭；beforeUnload 接入原生确认", () =>
  fixture(async (page) => {
    let dialog = await openForm(page);
    await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("x");
    await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(await page.getByRole("dialog", { name: "是否放弃修改？" }).count(), 0);
    dialog = await openForm(page);
    await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("草稿");
    const confirmation = page.waitForEvent("dialog");
    const reload = page.reload();
    const native = await confirmation;
    assert.equal(native.type(), "beforeunload");
    await native.dismiss();
    await reload.catch(() => {});
  }));

test("检查 false→创建，载荷相同、同步双击锁、等待时锁输入及关闭", () =>
  fixture(async (page, state) => {
    let release;
    state.holdCheck = new Promise((resolve) => {
      release = resolve;
    });
    const dialog = await openForm(page);
    await endpoints(page);
    await dialog.getByRole("textbox", { name: /延迟天数/ }).fill("3");
    await dialog.getByRole("textbox", { name: "描述", exact: true }).fill("等待验收");
    await dialog.getByRole("button", { name: "创建", exact: true }).evaluate((button) => {
      button.click();
      button.click();
    });
    await wait(() => calls(state, "/checkCircularDependency").length === 1);
    assert.equal(await dialog.getByRole("textbox", { name: /延迟天数/ }).isDisabled(), true);
    assert.equal(
      await dialog.getByRole("button", { name: "关闭", exact: true }).isDisabled(),
      true,
    );
    assert.equal(calls(state, "/createTaskDependency").length, 0);
    release();
    await wait(async () => !(await dialog.isVisible()));
    assert.equal(calls(state, "/createTaskDependency").length, 1);
    assert.deepEqual(
      calls(state, "/checkCircularDependency")[0].body,
      calls(state, "/createTaskDependency")[0].body,
    );
    assert.equal(await page.getByRole("dialog", { name: "是否放弃修改？" }).count(), 0);
  }));
for (const result of ["true", "失败", "非boolean"]) {
  test(`环检查 ${result} 禁止 create 并保留草稿`, () =>
    fixture(async (page, state) => {
      state.circular = result === "true" ? true : result === "非boolean" ? "false" : false;
      state.checkFailure = result === "失败";
      const dialog = await openForm(page);
      await endpoints(page);
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await visible(
        dialog.getByText(result === "true" ? "该依赖会形成循环，无法创建" : /检查失败/).first(),
      );
      assert.equal(calls(state, "/createTaskDependency").length, 0);
      if (result === "true") {
        await dialog.getByRole("textbox", { name: /延迟天数/ }).fill("3");
        assert.equal(await dialog.getByText("该依赖会形成循环，无法创建").isVisible(), true);
      }
    }));
}
test("创建并发拒绝保留，下一次重新检查", () =>
  fixture(
    async (page, state) => {
      const dialog = await openForm(page);
      await endpoints(page);
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await visible(dialog.getByText(/创建失败/));
      state.createFailure = false;
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await wait(async () => !(await dialog.isVisible()));
      assert.equal(calls(state, "/checkCircularDependency").length, 2);
      assert.equal(calls(state, "/createTaskDependency").length, 2);
    },
    { createFailure: true },
  ));
test("创建成功后刷新失败，仅重试读、不重发创建", () =>
  fixture(
    async (page, state) => {
      const dialog = await openForm(page);
      await endpoints(page);
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await wait(async () => !(await dialog.isVisible()));
      await visible(page.getByText("操作已成功，刷新失败", { exact: true }));
      state.listFailure = false;
      await page.getByRole("button", { name: "重试读取" }).click();
      await visible(page.locator('[data-dependency-id="12"]'));
      assert.equal(calls(state, "/createTaskDependency").length, 1);
    },
    { failReadAfterCreate: true },
  ));
test("单条删除取消零请求、作废保留、INACTIVE 禁用、总数不减", () =>
  fixture(async (page, state) => {
    await page
      .locator('[data-dependency-id="11"]')
      .getByRole("button", { name: "删除", exact: true })
      .click();
    let dialog = page.getByRole("dialog", { name: "确认删除依赖" });
    await visible(dialog.getByText(/作废此依赖，保留记录/));
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(calls(state, "/invalid/11").length, 0);
    await page
      .locator('[data-dependency-id="11"]')
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await dialog.getByRole("button", { name: "确认删除" }).click();
    await visible(page.locator('[data-dependency-id="11"]').getByText("已作废", { exact: true }));
    assert.equal(
      await page
        .locator('[data-dependency-id="11"]')
        .getByRole("button", { name: "删除", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(state.rows.length, 1);
    assert.equal(calls(state, "/invalid/11")[0].method, "POST");
  }));
test("批量冻结 IDs、取消零请求、一次严格载荷、末页删空夹紧", () =>
  fixture(
    async (page, state) => {
      assert.equal(
        await page.getByRole("button", { name: "批量删除", exact: true }).isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "下一页", exact: true }).click();
      await page.getByRole("checkbox", { name: "全选当前页" }).check();
      await page.getByRole("button", { name: "批量删除", exact: true }).click();
      let dialog = page.getByRole("dialog", { name: "确认批量删除" });
      await visible(dialog.getByText(/选中的 1 条/));
      assert.match(await dialog.innerText(), /#1 /);
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      assert.equal(calls(state, "/batchDelete").length, 0);
      await page.getByRole("button", { name: "批量删除", exact: true }).click();
      await dialog.getByRole("button", { name: "确认删除" }).evaluate((button) => {
        button.click();
        button.click();
      });
      await visible(page.getByText(/第 1\/1 页/));
      await visible(page.getByText("已选 0 条", { exact: true }));
      assert.equal(calls(state, "/batchDelete").length, 1);
      assert.deepEqual(calls(state, "/batchDelete")[0].body, { ids: [1] });
      assert.equal(
        state.rows.some((row) => row.id === 1),
        false,
      );
      assert.equal(state.rows.length, 20);
    },
    { rows: Array.from({ length: 21 }, (_, i) => edge(i + 1)) },
  ));
test("批删业务失败保留选择和冻结确认", () =>
  fixture(
    async (page, state) => {
      await page.getByRole("checkbox", { name: "全选当前页" }).check();
      await page.getByRole("button", { name: "批量删除", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "确认批量删除" });
      await dialog.getByRole("button", { name: "确认删除" }).click();
      await visible(dialog.getByText("批删失败", { exact: true }));
      assert.equal(await dialog.isVisible(), true);
      assert.equal(calls(state, "/batchDelete").length, 1);
      state.batchFailure = false;
      await dialog.getByRole("button", { name: "确认删除" }).click();
      await visible(page.getByText("当前项目暂无依赖关系。", { exact: true }));
    },
    { batchFailure: true },
  ));
test("冲突未检测、真实两项、失败保留过期结果、空结果清旧、重取统计", () =>
  fixture(async (page, state) => {
    await visible(page.getByText("尚未检测", { exact: true }));
    assert.equal(calls(state, "/detectConflicts").length, 0);
    state.conflicts = circularItems();
    await page.getByRole("button", { name: "检测冲突", exact: true }).click();
    await visible(page.getByText("发现 2 条冲突依赖", { exact: true }));
    await wait(() => calls(state, "/getStatistics").length >= 2);
    state.conflictFailure = true;
    await page.getByRole("button", { name: "检测冲突", exact: true }).click();
    await visible(page.getByText(/上次结果可能已过期/));
    assert.equal(await page.getByText("发现 2 条冲突依赖", { exact: true }).isVisible(), true);
    state.conflictFailure = false;
    state.conflicts = [];
    await page.getByRole("button", { name: "重试检测" }).click();
    await visible(page.getByText("检测完成，未发现循环依赖", { exact: true }));
    assert.equal(await page.getByText("发现 2 条冲突依赖", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /解决|忽略/ }).count(), 0);
  }));
test("统计 5/2/2，缺字段和 403 不补零、不阻断列表", () =>
  fixture(
    async (page, state) => {
      const region = page.getByRole("region", { name: "依赖统计" });
      await wait(async () => (await region.innerText()).includes("5"));
      assert.deepEqual(await region.locator(".text-2xl").allTextContents(), ["5", "2", "2"]);
      state.statistics = { totalDependencies: 5 };
      await page.getByRole("button", { name: "刷新", exact: true }).click();
      await visible(page.getByText(/缺失或无效字段/));
      assert.deepEqual(await region.locator(".text-2xl").allTextContents(), [
        "5",
        "不可用",
        "不可用",
      ]);
      state.statisticsFailure = true;
      await page.getByRole("button", { name: "重试统计" }).click();
      await visible(page.getByText(/无统计权限/));
      assert.equal(await page.locator('[data-dependency-id="11"]').count(), 1);
      assert.equal(
        await page.getByRole("button", { name: "新建依赖", exact: true }).isDisabled(),
        false,
      );
    },
    { statistics: { totalDependencies: 5, conflicts: 2, circularDependencies: 2 } },
  ));
test("详情方向、A→B 重挂载、项目错配不挂侧栏", () =>
  fixture(async (page, state) => {
    await page.locator('[data-dependency-id="11"]').getByRole("link").first().click();
    const sidebar = page.getByRole("complementary", { name: "任务依赖" });
    await visible(sidebar);
    await visible(
      sidebar.getByRole("region", { name: "前置任务" }).getByText("无前置任务", { exact: true }),
    );
    await sidebar
      .getByRole("region", { name: "后置任务" })
      .getByRole("link", { name: "#2 任务2", exact: true })
      .click();
    await visible(
      sidebar
        .getByRole("region", { name: "前置任务" })
        .getByRole("link", { name: "#1 任务1", exact: true }),
    );
    await visible(
      sidebar.getByRole("region", { name: "后置任务" }).getByText("无后置任务", { exact: true }),
    );
    const before = state.calls.filter((call) =>
      /getPredecessors|getSuccessors/.test(call.path),
    ).length;
    await page.goto(`${base}/p/OTHER/issues/1`);
    await visible(page.getByText(/不属于当前项目/));
    assert.equal(await sidebar.count(), 0);
    assert.equal(
      state.calls.filter((call) => /getPredecessors|getSuccessors/.test(call.path)).length,
      before,
    );
  }));
test("详情前后置独立错误与重试", () =>
  fixture(
    async (page, state) => {
      await page.goto(`${base}/p/P3/issues/2`);
      const sidebar = page.getByRole("complementary", { name: "任务依赖" });
      await visible(sidebar.getByText(/前置任务加载失败/));
      await visible(sidebar.getByText("无后置任务", { exact: true }));
      state.sidebarFailure = null;
      await sidebar.getByRole("button", { name: "重试前置任务" }).click();
      await visible(sidebar.getByRole("link", { name: "#1 任务1", exact: true }));
    },
    { sidebarFailure: "successorId" },
  ));
test("creating 时路由离开，迟到成功失效缓存与反馈，不关闭新项目弹窗", () =>
  fixture(async (page, state) => {
    let release;
    state.holdCreate = new Promise((resolve) => {
      release = resolve;
    });
    const dialog = await openForm(page);
    await endpoints(page);
    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await wait(() => calls(state, "/createTaskDependency").length === 1);
    await page
      .locator('[data-dependency-id="11"]')
      .getByRole("link")
      .first()
      .evaluate((link) => link.click());
    await visible(page.getByRole("dialog", { name: "是否放弃修改？" }));
    await abandon(page);
    await visible(page.getByRole("complementary", { name: "任务依赖" }));
    const before = calls(state, "/getSuccessors/1").length;
    release();
    await wait(() => calls(state, "/getSuccessors/1").length > before);
    await visible(page.getByText("依赖已创建", { exact: true }));
    await page.getByRole("link", { name: "管理依赖", exact: true }).click();
    const next = await openForm(page);
    await next.getByRole("textbox", { name: "描述", exact: true }).fill("新草稿");
    assert.equal(await next.isVisible(), true);
  }));

test("核心 A→B→A：逆向拦截、作废后重新检查可建、间接环返回 true 同样阻止", () =>
  fixture(
    async (page, state) => {
      let dialog = await openForm(page);
      await endpoints(page, "#1 任务1", "#2 任务2");
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await wait(async () => !(await dialog.isVisible()));
      state.circular = true;
      dialog = await openForm(page);
      await endpoints(page, "#2 任务2", "#1 任务1");
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await visible(dialog.getByText("该依赖会形成循环，无法创建"));
      assert.equal(calls(state, "/createTaskDependency").length, 1);
      assert.equal(state.rows.length, 1);
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      await abandon(page);
      await page
        .locator('[data-dependency-id="1"]')
        .getByRole("button", { name: "删除", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "确认删除依赖" })
        .getByRole("button", { name: "确认删除" })
        .click();
      await visible(page.locator('[data-dependency-id="1"]').getByText("已作废", { exact: true }));
      state.circular = false;
      dialog = await openForm(page);
      await endpoints(page, "#2 任务2", "#1 任务1");
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await wait(async () => !(await dialog.isVisible()));
      assert.equal(calls(state, "/createTaskDependency").length, 2);
      state.rows = [edge(40, 1, 2), edge(41, 2, 3)];
      state.circular = true;
      await page.getByRole("button", { name: "刷新", exact: true }).click();
      dialog = await openForm(page);
      await endpoints(page, "#3 任务3", "#1 任务1");
      await dialog.getByRole("button", { name: "创建", exact: true }).click();
      await visible(dialog.getByText("该依赖会形成循环，无法创建"));
      assert.equal(calls(state, "/createTaskDependency").length, 2);
    },
    { rows: [] },
  ));

test("甘特缓存：离开图表后批删、返回立即重取且 SVG 两条边消失", () =>
  fixture(
    async (page, state) => {
      // 使用同文档路由跳转，保留 QueryClient，不能用 reload 模拟缓存失效。
      // Shell 项目导航链接来自现有路由；按 href 定位，避免同名入口歧义。
      await page.locator('a[href="/p/P3/gantt"]').first().click();
      const paths = page.locator('svg path[stroke="#0052cc"], svg path[stroke="#c52a2a"]');
      await wait(async () => (await paths.count()) === 2);
      const before = calls(state, "/gantt/7").length;
      await page.locator('a[href="/p/P3/dependencies"]').first().click();
      await page.getByRole("checkbox", { name: "全选当前页" }).check();
      await page.getByRole("button", { name: "批量删除", exact: true }).click();
      await page
        .getByRole("dialog", { name: "确认批量删除" })
        .getByRole("button", { name: "确认删除" })
        .click();
      await visible(page.getByText("当前项目暂无依赖关系。", { exact: true }));
      await page.locator('a[href="/p/P3/gantt"]').first().click();
      await wait(() => calls(state, "/gantt/7").length > before);
      await wait(async () => (await paths.count()) === 0);
      assert.equal(state.rows.length, 0);
    },
    { rows: [edge(11, 1, 2), edge(12, 1, 3)] },
  ));
