import { test } from "node:test";
import assert from "node:assert/strict";
import { readStoredJson, writeStoredJson, changeFeedback } from "./persistence.ts";

test("存储对象 getter 本身抛错也返回显式失败", () => {
  assert.equal(readStoredJson(() => { throw new Error("denied"); }, "k", (value) => value).ok, false);
  assert.equal(writeStoredJson(() => { throw new Error("denied"); }, "k", {}).ok, false);
});

test("decode 拒绝格式时不触发任何写入", () => {
  let writes = 0;
  const storage = {getItem: () => "{}", setItem: () => { writes++; }};
  assert.equal(readStoredJson(() => storage, "k", () => { throw new Error("bad shape"); }).ok, false);
  assert.equal(writes, 0);
});

test("空存储与合法存储可区分，JSON 序列化失败也显式返回", () => {
  const storage = {getItem: () => null, setItem: () => {}};
  assert.deepEqual(readStoredJson(() => storage, "k", (v) => v), {ok: true, value: null});
  assert.equal(writeStoredJson(() => storage, "k", {value: 1n}).ok, false);
});

test("未保存状态不显示已保存或已创建的成功承诺", () => {
  assert.equal(changeFeedback("已保存项目设置", null), "已保存项目设置");
  assert.match(changeFeedback("已保存项目设置", "quota"), /尚未保存/);
  assert.doesNotMatch(changeFeedback("已保存项目设置", "quota"), /已保存项目设置/);
});
