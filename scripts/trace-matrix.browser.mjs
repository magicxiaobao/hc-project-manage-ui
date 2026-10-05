/**
 * p3-trace-matrix 浏览器交互断言：mock真实信封与混合状态摘要，不证明数据库EXISTS。
 * pnpm dev 后运行 pnpm exec node --test scripts/trace-matrix.browser.mjs。
 * 可指定 P3_BROWSER_URL / P3_CHROMIUM_EXECUTABLE；遵循现有浏览器脚本模式。
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
const wait = async (check) => {
  for (let n = 0; n < 150; n++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("等待矩阵交互断言超时");
};
const node = (objectType, objectId, status, requirementId = 1) => ({
  objectType,
  objectId,
  displayName: `${objectType}-${status}-${objectId}`,
  status,
  assigneeId: null,
  runId: null,
  runType: null,
  direct: true,
  path: [
    ...(objectType === "REQUIREMENT" ? [] : [{ objectType: "REQUIREMENT", objectId: requirementId }]),
    { objectType, objectId },
  ],
});
const row = (id) => ({
  requirement: node("REQUIREMENT", id, "DRAFT"),
  taskSummaries: [node("TASK", 100 + id, "TODO", id), node("TASK", 200 + id, "COMPLETED", id)],
  testCaseSummaries: [node("TEST_CASE", 300 + id, "DRAFT", id), node("TEST_CASE", 400 + id, "ACTIVE", id)],
  defectSummaries: [node("DEFECT", 500 + id, "NEW", id), node("DEFECT", 600 + id, "RESOLVED", id)],
  versionEvidence: { total: 0, truncated: false, items: [] },
});
const matrixPath = "/api/requirement/v1/trace/matrix/findByPage";

async function fixture(fn, { loggedIn = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const state = {
    rows: Array.from({ length: 41 }, (_, i) => row(i + 1)),
    calls: [],
    failure: null,
    hold: null,
  };
  if (loggedIn)
    await page.addInitScript(() => {
      localStorage.setItem("token", "matrix-browser-fixture");
      localStorage.setItem(
        "userInfo",
        JSON.stringify({ userId: "1", userName: "测试用户", cnName: "测试用户", roles: ["ADMIN"] }),
      );
    });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON();
    state.calls.push({ path, method: request.method(), body });
    const ok = (result) => route.fulfill({ json: { code: 1, msg: "ok", result } });
    if (path === "/api/project/v1/findByPage")
      return ok({
        list: [
          {
            id: body.bean?.projectKey === "OTHER" ? 8 : 7,
            projectKey: body.bean?.projectKey || "P3",
            projectName: "测试项目",
          },
        ],
        total: 1,
        pageNumber: body.page,
        pageSize: body.pageSize,
      });
    if (path === matrixPath) {
      assert.equal(request.method(), "POST");
      assert.equal(body.pageSize, 20);
      assert.ok([7, 8].includes(body.bean.projectId));
      assert.ok(
        Object.keys(body.bean).every((key) =>
          [
            "projectId",
            "requirementStatus",
            "taskStatus",
            "testCaseStatus",
            "defectStatus",
          ].includes(key),
        ),
      );
      const failure = state.failure;
      const source = state.rows;
      if (state.hold && state.hold.status === body.bean.taskStatus) {
        state.hold.started = true;
        await state.hold.promise;
      }
      if (failure === "network") return route.abort("failed");
      if (failure === "permission")
        return route.fulfill({ status: 403, json: { code: 403, msg: "无矩阵权限", result: null } });
      if (failure === "archived")
        return route.fulfill({ json: { code: 40001, msg: "ARCHIVED 用例已失效", result: null } });
      if (failure === "contract")
        return ok({
          list: [{ ...row(1), taskSummaries: null }],
          total: 1,
          pageNumber: body.page,
          pageSize: 20,
        });
      const selected = source.filter(
        (item) =>
          (!body.bean.requirementStatus ||
            item.requirement.status === body.bean.requirementStatus) &&
          (!body.bean.taskStatus ||
            item.taskSummaries.some((n) => n.status === body.bean.taskStatus)) &&
          (!body.bean.testCaseStatus ||
            item.testCaseSummaries.some((n) => n.status === body.bean.testCaseStatus)) &&
          (!body.bean.defectStatus ||
            item.defectSummaries.some((n) => n.status === body.bean.defectStatus)),
      );
      return ok({
        list: selected.slice((body.page - 1) * 20, body.page * 20),
        total: selected.length,
        pageNumber: body.page,
        pageSize: 20,
      });
    }
    return ok([]);
  });
  try {
    await page.goto(`${base}/p/P3/traceability`);
    if (loggedIn) await wait(() => page.getByRole("table", { name: "需求追溯矩阵" }).isVisible());
    await fn(page, state);
    assert.ok(
      state.calls.every((call) => call.method === "GET" || call.path.endsWith("findByPage")),
      "矩阵不得发业务写请求",
    );
  } finally {
    await context.close();
  }
}
const lastMatrix = (state) => state.calls.filter((call) => call.path === matrixPath).at(-1)?.body;
async function select(page, label, option) {
  await page.getByRole("button", { name: new RegExp(`${label}$`) }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
const ready = (page) =>
  wait(async () => !(await page.getByText("正在加载矩阵…", { exact: true }).isVisible()));
const tableText = (page) => page.getByRole("table", { name: "需求追溯矩阵" }).innerText();
const pager = (page) => page.getByLabel("矩阵分页");

test("四类筛选下推、AND、列内徽标过滤、成功无命中、重置与服务端20条分页", async () =>
  fixture(async (page, state) => {
    assert.deepEqual(lastMatrix(state), { page: 1, pageSize: 20, bean: { projectId: 7 } });
    assert.equal(await page.locator("tbody tr").count(), 20);
    assert.equal(
      await page.getByRole("button", { name: "上一页", exact: true }).isEnabled(),
      false,
    );
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await wait(async () => (await pager(page).innerText()).includes("第 2 /"));
    await ready(page);
    for (const [label, option, field, status, excluded] of [
      ["任务状态", "已完成", "taskStatus", "COMPLETED", "TASK-TODO"],
      ["用例状态", "生效", "testCaseStatus", "ACTIVE", "TEST_CASE-DRAFT"],
      ["缺陷状态", "已解决", "defectStatus", "RESOLVED", "DEFECT-NEW"],
      ["需求状态", "草稿", "requirementStatus", "DRAFT", null],
    ]) {
      await select(page, label, option);
      await wait(() => Promise.resolve(lastMatrix(state)?.bean[field] === status));
      await ready(page);
      assert.equal(lastMatrix(state).page, 1);
      if (excluded) assert.ok(!(await tableText(page)).includes(excluded));
      assert.ok((await pager(page).innerText()).includes("共 41 条需求"));
    }
    assert.equal(Object.keys(lastMatrix(state).bean).length, 5);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await wait(async () => (await pager(page).innerText()).includes("第 2 /"));
    await ready(page);
    await page.getByRole("button", { name: "重置", exact: true }).click();
    await ready(page);
    assert.ok((await pager(page).innerText()).includes("第 1 /"));
    for (const label of ["需求状态", "任务状态", "用例状态", "缺陷状态"])
      assert.ok(
        (await page.getByRole("button", { name: new RegExp(`${label}$`) }).innerText()).includes(
          "全部",
        ),
      );
    assert.ok((await tableText(page)).includes("TASK-TODO"));
    for (const [label, option, field, status] of [
      ["需求状态", "评审中", "requirementStatus", "REVIEW"],
      ["任务状态", "已暂停", "taskStatus", "PAUSED"],
      ["用例状态", "评审中", "testCaseStatus", "REVIEW"],
      ["缺陷状态", "已拒绝", "defectStatus", "REJECTED"],
    ]) {
      await select(page, label, option);
      await wait(() => Promise.resolve(lastMatrix(state)?.bean[field] === status));
      await ready(page);
      assert.ok(await page.getByText("没有符合条件的需求", { exact: true }).isVisible());
      await page.getByRole("button", { name: "重置", exact: true }).click();
      await ready(page);
    }
    for (const target of [2, 3]) {
      await page.getByRole("button", { name: "下一页", exact: true }).click();
      await wait(async () => (await pager(page).innerText()).includes(`第 ${target} /`));
      await ready(page);
    }
    assert.equal(await page.locator("tbody tr").count(), 1);
    assert.equal(
      await page.getByRole("button", { name: "下一页", exact: true }).isEnabled(),
      false,
    );
    await page.getByRole("button", { name: "上一页", exact: true }).click();
    await ready(page);
    assert.ok((await pager(page).innerText()).includes("第 2 /"));
  }));

test("快速筛选迟到响应隔离；切项目回首页并清空筛选", async () =>
  fixture(async (page, state) => {
    let release;
    state.hold = {
      status: "TODO",
      started: false,
      promise: new Promise((resolve) => {
        release = resolve;
      }),
    };
    await select(page, "任务状态", "待开始");
    await wait(() => Promise.resolve(state.hold.started));
    assert.equal(await page.getByRole("table").count(), 0, "新key不得展示上一个key的行");
    await select(page, "任务状态", "已完成");
    await ready(page);
    assert.ok(!(await tableText(page)).includes("TASK-TODO"));
    release();
    await page.waitForTimeout(100);
    assert.ok(!(await tableText(page)).includes("TASK-TODO"));
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await ready(page);
    // SPA导航，保留QueryClient来验证按项目归属重挂载（不做整页刷新）。
    await page.evaluate(() => {
      history.pushState({}, "", "/p/OTHER/traceability");
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await wait(() => Promise.resolve(lastMatrix(state)?.bean.projectId === 8));
    await ready(page);
    assert.deepEqual(lastMatrix(state), { page: 1, pageSize: 20, bean: { projectId: 8 } });
    assert.ok((await tableText(page)).includes("TASK-TODO"));
  }));

test("无关联/仅版本证据三列未覆盖；后台错误保留上次数据；越界与total归零恢复", async () =>
  fixture(async (page, state) => {
    const empty = {
      ...row(1),
      taskSummaries: [],
      testCaseSummaries: [],
      defectSummaries: [],
      versionEvidence: {
        total: 1,
        truncated: false,
        items: [
          {
            versionId: 9,
            versionName: "版本",
            versionStatus: "TESTING",
            testEvidenceState: "NO_FULL_REGRESSION",
            evidenceRunId: null,
            latestExecutionSummaries: [],
          },
        ],
      },
    };
    state.rows = [empty];
    // 筛选切换到新key触发读取，回全部刷新原key。
    await select(page, "需求状态", "草稿");
    await ready(page);
    assert.equal((await tableText(page)).match(/未覆盖/g).length, 3);
    state.failure = "permission";
    // 重载测试同key缓存刷新失败，使用浏览器断网重连沿用QueryClient策略。
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await wait(() => page.getByRole("alert").isVisible());
    assert.ok((await page.getByRole("alert").innerText()).includes("上次成功的结果"));
    state.failure = null;
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await ready(page);
    state.rows = Array.from({ length: 21 }, (_, i) => row(i + 1));
    await page.getByRole("button", { name: "重置", exact: true }).click();
    await ready(page);
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await ready(page);
    state.rows = [];
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await wait(async () => (await pager(page).innerText()).includes("第 1 /"));
    await ready(page);
    // 回到已缓存首页后再按既有重连策略刷新该key。
    await page.context().setOffline(true);
    await page.context().setOffline(false);
    await wait(() => page.getByText("暂无需求矩阵数据", { exact: true }).isVisible());
    await ready(page);
    assert.ok((await pager(page).innerText()).includes("第 1 / 1 页"));
    assert.ok(await page.getByText("暂无需求矩阵数据", { exact: true }).isVisible());
  }));

for (const failure of ["permission", "archived", "contract", "network"]) {
  test(`${failure}错误不伪装为空，重试当前key`, async () =>
    fixture(async (page, state) => {
      state.failure = failure;
      await select(page, "用例状态", failure === "archived" ? "已归档" : "生效");
      await wait(() => page.getByRole("alert").isVisible());
      assert.equal(await page.getByText("没有符合条件的需求", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("table").count(), 0);
      state.failure = null;
      await page.getByRole("button", { name: "重试", exact: true }).click();
      await ready(page);
      assert.equal(lastMatrix(state).bean.testCaseStatus, failure === "archived" ? "ARCHIVED" : "ACTIVE");
      if (failure === "archived") assert.ok(await page.getByText("没有符合条件的需求", { exact: true }).isVisible());
      else assert.ok(await page.getByRole("table").isVisible());
    }));
}

test("未登录展示登录入口且不请求矩阵", async () =>
  fixture(
    async (page, state) => {
      assert.ok(await page.getByText("请登录后查看需求追溯矩阵。", { exact: true }).isVisible());
      assert.ok(await page.getByRole("link", { name: "登录", exact: true }).isVisible());
      assert.equal(state.calls.filter((call) => call.path === matrixPath).length, 0);
    },
    { loggedIn: false },
  ));
