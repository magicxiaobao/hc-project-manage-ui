import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { usePm, readPersistedPm, persistPm, bindPmPersistence } from "./store.ts";
import { useAuthStore } from "../api/auth-store.ts";
import { seed } from "./seed.ts";

let cleanup: (() => void) | undefined;
beforeEach(() => { usePm.setState({ ...structuredClone(seed), ready: false }); });
afterEach(() => { cleanup?.(); cleanup = undefined; Reflect.deleteProperty(globalThis, "window"); });

function browser(storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem?: (key: string) => void }) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
}

test("读取被禁用的本机存储不会抛错，也不删除或覆盖原数据", () => {
  let writes = 0;
  browser({ getItem: () => { throw new Error("denied"); }, setItem: () => { writes++; }, removeItem: () => { writes++; } });
  assert.doesNotThrow(() => readPersistedPm());
  assert.equal(readPersistedPm().ok, false);
  assert.equal(writes, 0);
});

test("损坏 JSON 保持原文，返回显式读取失败", () => {
  let raw = "{broken";
  browser({ getItem: () => raw, setItem: (_key, value) => { raw = value; }, removeItem: () => { raw = ""; } });
  const result = readPersistedPm();
  assert.equal(result.ok, false);
  assert.equal(raw, "{broken");
});

test("读失败结束加载并阻断业务内容，重试不会悄悄写入示例", () => {
  browser({ getItem: () => { throw new Error("denied"); }, setItem: () => assert.fail("must not overwrite") });
  cleanup = bindPmPersistence();
  assert.equal(usePm.getState().ready, false);
  assert.match(usePm.getState().persistenceError ?? "", /读取/);
});

test("写入配额失败返回失败且保留当前状态，不假称保存成功", () => {
  browser({ getItem: () => null, setItem: () => { throw new Error("quota"); } });
  const state = usePm.getState();
  assert.equal(persistPm(state).ok, false);
  assert.equal(usePm.getState().items, state.items);
});

test("持久化订阅仅对业务变化写入，写错可重试恢复", () => {
  let fail = true; let writes = 0; let saved = "";
  browser({ getItem: () => null, setItem: (_key, value) => { writes++; if (fail) throw new Error("quota"); saved = value; } });
  cleanup = bindPmPersistence();
  usePm.getState().setNavOpen(true);
  assert.equal(writes, 0);
  const item = usePm.getState().items[0];
  usePm.getState().updateItem(item.id, { description: "仍在当前页面" });
  assert.equal(writes, 1);
  assert.match(usePm.getState().persistenceError ?? "", /保存/);
  fail = false;
  usePm.getState().retryPersistence();
  assert.equal(usePm.getState().persistenceError, null);
  assert.equal(JSON.parse(saved).items.find((entry: {id: string}) => entry.id === item.id).description, "仍在当前页面");
  assert.equal("persistenceError" in JSON.parse(saved), false);
});

test("冻结版本不能从详情 updateItem 入口加入，失败不改数据", () => {
  const state = usePm.getState();
  const item = state.items.find((entry) => entry.projectId === "pr-hc" && entry.versionId === "v-17")!;
  const before = structuredClone(item);
  const result = state.updateItem(item.id, { versionId: "v-16", title: "也不能部分更新" });
  assert.equal(result.ok, false);
  assert.deepEqual(usePm.getState().items.find((entry) => entry.id === item.id), before);
});

test("壳层导航重挂载不覆盖尚未保存的改动", () => {
  const saved = structuredClone(seed);
  browser({ getItem: () => JSON.stringify(saved), setItem: () => { throw new Error("quota"); } });
  cleanup = bindPmPersistence();
  const item = usePm.getState().items[0];
  usePm.getState().updateItem(item.id, { description: "导航后仍须保留" });
  cleanup();
  cleanup = bindPmPersistence();
  assert.equal(usePm.getState().items[0].description, "导航后仍须保留");
  assert.match(usePm.getState().persistenceError ?? "", /保存/);
});

test("读取权限恢复后重试恢复真实存储，无示例覆盖", () => {
  let fail = true; let writes = 0;
  const saved = structuredClone(seed);
  saved.projects[0].name = "恢复的项目";
  browser({ getItem: () => { if (fail) throw new Error("denied"); return JSON.stringify(saved); }, setItem: () => { writes++; } });
  cleanup = bindPmPersistence();
  fail = false;
  usePm.getState().retryPersistence();
  assert.equal(usePm.getState().ready, true);
  assert.equal(usePm.getState().projects[0].name, "恢复的项目");
  assert.equal(usePm.getState().persistenceError, null);
  assert.equal(writes, 0);
});

for (const [label, corrupt] of [
  ["对象标题", (data: Record<string, unknown>) => { (data.items as Record<string, unknown>[])[0].title = { invalid: true }; }],
  ["缺失项目名", (data: Record<string, unknown>) => { delete (data.projects as Record<string, unknown>[])[0].name; }],
  ["非法进度值", (data: Record<string, unknown>) => { (data.items as Record<string, unknown>[])[0].progress = "broken"; }],
  ["非法步骤文本", (data: Record<string, unknown>) => { (data.testCases as Record<string, unknown>[])[0].steps = [{ action: {}, expected: "结果" }]; }],
  ["非法成员集合", (data: Record<string, unknown>) => { (data.projects as Record<string, unknown>[])[0].memberIds = [null]; }],
] as const) {
  test(`有效 JSON 的${label}阻断读取并保留原文，不安装写订阅`, () => {
    const data = structuredClone(seed) as unknown as Record<string, unknown>;
    corrupt(data);
    const original = JSON.stringify(data);
    let raw = original; let writes = 0;
    browser({ getItem: () => raw, setItem: (_key, value) => { writes++; raw = value; }, removeItem: () => { raw = ""; } });
    cleanup = bindPmPersistence();
    assert.equal(usePm.getState().ready, false);
    assert.match(usePm.getState().persistenceError ?? "", /读取/);
    // 即使程序触发普通变更，也不能覆盖尚未成功读取的原件。
    usePm.getState().updateItem(usePm.getState().items[0].id, { description: "禁止覆盖损坏原文" });
    assert.equal(writes, 0);
    assert.equal(raw, original);
  });
}

test("既有可选字段缺失仍可读取，保留原有样板归一化", () => {
  const data = structuredClone(seed);
  data.testCases.forEach((entry) => { delete entry.steps; });
  data.testRuns.forEach((entry) => { delete entry.sourceRunId; delete entry.cancelReason; });
  data.testExecutions.forEach((entry) => { delete entry.defectId; });
  data.workLogs.forEach((entry) => { delete entry.status; });
  browser({ getItem: () => JSON.stringify(data), setItem: () => assert.fail("read must not write") });
  const result = readPersistedPm();
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(Array.isArray(result.value?.testCases[0].steps));
});

test("冻结版本不能移出；跨项目版本也拒绝；合法变更成功", () => {
  const state = usePm.getState();
  const item = state.items.find((entry) => entry.projectId === "pr-hc" && entry.versionId === "v-17")!;
  assert.equal(state.updateItem(item.id, { versionId: "v-pay" }).ok, false);
  assert.equal(state.setItemVersion(item.id, "v-18").ok, true);
  usePm.setState({ versions: usePm.getState().versions.map((entry) => entry.id === "v-18" ? {...entry, status: "FROZEN" as const} : entry) });
  assert.equal(usePm.getState().updateItem(item.id, { versionId: null }).ok, false);
  assert.equal(usePm.getState().setItemVersion(item.id, null).ok, false);
});

test("拖拽重开必须返回真实原因请求，取消前无状态/历史副作用", () => {
  const data = usePm.getState();
  const item = data.items.find((entry) => entry.kind === "defect")!;
  usePm.setState({items: data.items.map((entry) => entry.id === item.id ? {...entry, status: "CLOSED"} : entry)});
  const before = usePm.getState();
  const result = before.moveToColumn(item.id, "todo");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.requiresReason, "REOPEN");
  assert.equal(usePm.getState().histories, before.histories);
  assert.equal(usePm.getState().items, before.items);
  assert.equal(usePm.getState().moveToColumn(item.id, "todo", "  ", "CLOSED").ok, false);
  assert.equal(usePm.getState().moveToColumn(item.id, "todo", "复测发现仍可重现", "CLOSED").ok, true);
  assert.equal(usePm.getState().histories.length, before.histories.length + 1);
  assert.equal(usePm.getState().histories[0].reason, "复测发现仍可重现");
  assert.equal(usePm.getState().moveToColumn(item.id, "todo", "重复点击", "CLOSED").ok, false);
  assert.equal(usePm.getState().histories.length, before.histories.length + 1);
});

// 覆盖领域声明中未必出现在 seed 的可选/可空文本，防止只修某一个日期字段。
const legacyTextFields = {
  items: ["requirementType", "taskType", "defectType", "severity", "assigneeId", "sprintId", "versionId", "parentId", "planStart", "planEnd"],
  histories: ["reason"],
  notices: ["itemId"],
  testCases: ["requirementId", "assigneeId"],
  testRuns: ["versionId", "sourceRunId", "cancelReason"],
  testExecutions: ["result", "defectId"],
  workLogs: ["status"],
  boards: ["sprintId"],
  releases: ["environmentId"],
};

function assertBlockedWithoutWrites(data: unknown, label: string) {
  cleanup?.();
  usePm.setState({ ...structuredClone(seed), ready: false, persistenceError: null });
  const original = JSON.stringify(data);
  let raw = original; let writes = 0;
  browser({ getItem: () => raw, setItem: (_key, value) => { writes++; raw = value; }, removeItem: () => { writes++; raw = ""; } });
  assert.equal(readPersistedPm().ok, false, label);
  cleanup = bindPmPersistence();
  assert.equal(usePm.getState().ready, false, label);
  usePm.getState().markNoticesRead();
  usePm.getState().retryPersistence();
  assert.equal(usePm.getState().ready, false, label);
  assert.equal(writes, 0, label);
  assert.equal(raw, original, label);
}

test("所有已使用可选/可空文本拒绝错误标量或嵌套值，重试也不覆盖原文", () => {
  for (const [collection, fields] of Object.entries(legacyTextFields)) {
    for (const field of fields) {
      for (const value of [123, true, { invalid: true }, ["invalid"]]) {
        const data = structuredClone(seed) as unknown as Record<string, Record<string, unknown>[]>;
        data[collection][0][field] = value;
        assertBlockedWithoutWrites(data, `${collection}.${field}: ${JSON.stringify(value)}`);
      }
    }
  }
});

test("seed 所有持久字段的错误类型均阻断读取，保持原始字节", () => {
  for (const [collection, entries] of Object.entries(seed)) {
    if (!Array.isArray(entries)) continue;
    for (const [field, value] of Object.entries(entries[0])) {
      const data = structuredClone(seed) as unknown as Record<string, Record<string, unknown>[]>;
      data[collection][0][field] = typeof value === "string" ? 123 : typeof value === "number" ? "broken" : typeof value === "boolean" ? 123 : {};
      assertBlockedWithoutWrites(data, `${collection}.${field}`);
    }
  }
});

test("旧数据省略可选字段/可空字段仍可读取，合法计划日期保持原值", () => {
  const data = structuredClone(seed) as unknown as Record<string, Record<string, unknown>[]>;
  for (const [collection, fields] of Object.entries(legacyTextFields)) {
    for (const record of data[collection]) for (const field of fields) delete record[field];
  }
  data.testCases.forEach((record) => { delete record.steps; });
  data.items[0].planStart = "2026-10-01";
  data.items[0].planEnd = "2026-10-09";
  browser({ getItem: () => JSON.stringify(data), setItem: () => assert.fail("read must not write") });
  const result = readPersistedPm();
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value?.items[0].planStart, "2026-10-01");
    assert.equal(result.value?.items[0].planEnd, "2026-10-09");
    assert.ok(Array.isArray(result.value?.testCases[0].steps));
    assert.equal(typeof result.value?.workLogs[0].status, "string");
  }
});

test("步骤双文本和字符串集合逐元素检查；必需集合缺失也不能进入可写状态", () => {
  for (const steps of [null, 123, {}, [null], [[]], [{ action: "操作", expected: false }], [{ action: 123, expected: "结果" }]]) {
    const data = structuredClone(seed) as unknown as Record<string, Record<string, unknown>[]>;
    data.testCases[0].steps = steps;
    assertBlockedWithoutWrites(data, `steps: ${JSON.stringify(steps)}`);
  }
  for (const [collection, field] of [["items", "tags"], ["projects", "memberIds"]]) {
    for (const value of [undefined, null, [123], [true], [{}]]) {
      const data = structuredClone(seed) as unknown as Record<string, Record<string, unknown>[]>;
      data[collection][0][field] = value;
      assertBlockedWithoutWrites(data, `${collection}.${field}: ${JSON.stringify(value)}`);
    }
  }
});

for (const versionStatus of ["FROZEN", "RELEASED", "DEPRECATED"] as const) {
  test(`clone ${versionStatus} 范围中的三类事项不会扩大实时版本范围或改动快照`, () => {
    const data = structuredClone(seed);
    data.versions = data.versions.map((version) =>
      version.id === "v-17" ? { ...version, status: versionStatus } : version,
    );
    data.releases[0].snapshot = {
      takenAt: "2026-10-01T00:00:00.000Z",
      items: data.items
        .filter((item) => item.versionId === "v-17")
        .map(({ id, key, title, kind, status }) => ({ id, key, title, kind, status })),
      openRequirements: 0,
      openTasks: 0,
      openDefects: 0,
      failed: 0,
      waiver: null,
    };
    usePm.setState(data);
    const before = usePm.getState();
    const scope = structuredClone(before.items.filter((item) => item.versionId === "v-17"));
    const releases = structuredClone(before.releases);
    const versions = structuredClone(before.versions);
    for (const [kind, initialStatus] of [
      ["requirement", "DRAFT"],
      ["task", "TODO"],
      ["defect", "NEW"],
    ] as const) {
      const source = before.items.find((item) => item.kind === kind && item.versionId === "v-17")!;
      const original = structuredClone(source);
      const result = usePm.getState().cloneItem(source.id);
      if (!result.ok) assert.fail(result.message);
      const copy = usePm.getState().items.find((item) => item.id === result.id)!;
      assert.notEqual(copy.id, source.id);
      assert.notEqual(copy.key, source.key);
      assert.equal(copy.key, result.key);
      assert.equal(copy.status, initialStatus);
      assert.equal(copy.title, `${source.title} 副本`);
      assert.equal(copy.progress, 0);
      assert.equal(copy.versionId, null);
      for (const field of [
        "description",
        "kind",
        "projectId",
        "parentId",
        "assigneeId",
        "sprintId",
        "storyPoints",
        "tags",
        "priority",
        "planStart",
        "planEnd",
        "baselineStart",
        "baselineEnd",
        "dueDate",
      ] as const) {
        assert.deepEqual(copy[field], source[field], field);
      }
      assert.deepEqual(
        usePm.getState().items.find((item) => item.id === source.id),
        original,
      );
      assert.deepEqual(
        usePm.getState().items.filter((item) => item.versionId === "v-17"),
        scope,
      );
      assert.deepEqual(usePm.getState().versions, versions);
      assert.deepEqual(usePm.getState().releases, releases);
    }
  });
}

for (const versionStatus of ["PLANNING", "DEVELOPMENT", "TESTING"] as const) {
  test(`clone ${versionStatus} 版本按既有合同保留版本归属`, () => {
    const data = structuredClone(seed);
    data.versions = data.versions.map((version) =>
      version.id === "v-17" ? { ...version, status: versionStatus } : version,
    );
    usePm.setState(data);
    const source = data.items.find((item) => item.versionId === "v-17")!;
    const scopeSize = data.items.filter((item) => item.versionId === "v-17").length;
    const result = usePm.getState().cloneItem(source.id);
    if (!result.ok) assert.fail(result.message);
    assert.equal(usePm.getState().items.find((item) => item.id === result.id)?.versionId, "v-17");
    assert.equal(
      usePm.getState().items.filter((item) => item.versionId === "v-17").length,
      scopeSize + 1,
    );
    assert.deepEqual(
      usePm.getState().items.find((item) => item.id === source.id),
      source,
    );
  });
}

test("clone 未分配版本的事项仍不分配版本，不存在的事项不创建副本", () => {
  const source = usePm.getState().items.find((item) => item.versionId === null)!;
  const result = usePm.getState().cloneItem(source.id);
  if (!result.ok) assert.fail(result.message);
  assert.equal(usePm.getState().items.find((item) => item.id === result.id)?.versionId, null);
  const before = usePm.getState();
  assert.equal(before.cloneItem("missing-item").ok, false);
  assert.equal(usePm.getState().items, before.items);
});

test("后端模式（已登录）下演示数据只读：写入动作被拒绝且状态不变", () => {
  const pm = usePm.getState();
  const item = pm.items[0];
  const beforeItems = structuredClone(pm.items);
  const beforeComments = pm.comments.length;
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: "u-1", userName: "tester", cnName: null, extraInfo: {}, roles: [], authorities: [] },
    token: "token",
  });
  try {
    const updateResult = usePm.getState().updateItem(item.id, { title: "hacked" });
    assert.equal(updateResult.ok, false);
    assert.deepEqual(usePm.getState().items, beforeItems);

    usePm.getState().addComment(item.id, "hacked comment");
    assert.equal(usePm.getState().comments.length, beforeComments);

    const createdId = usePm.getState().createItem({
      projectId: item.projectId,
      kind: "task",
      title: "hacked",
      description: "",
      priority: "MEDIUM",
      assigneeId: null,
      sprintId: null,
    });
    assert.equal(createdId, "");
    assert.equal(usePm.getState().items.length, beforeItems.length);

    const moveResult = usePm.getState().moveToColumn(item.id, "done");
    assert.equal(moveResult.ok, false);
    assert.deepEqual(usePm.getState().items, beforeItems);
  } finally {
    useAuthStore.setState({ isAuthenticated: false, user: null, token: null });
  }
  // 登出后恢复可写
  const afterLogout = usePm.getState().updateItem(item.id, { title: "ok" });
  assert.equal(afterLogout.ok, true);
  assert.equal(usePm.getState().items[0].title, "ok");
});
