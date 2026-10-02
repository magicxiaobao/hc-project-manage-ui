import assert from "node:assert/strict";
import { it } from "node:test";
import {
  isItemPath,
  parseProjectViewSearch,
  readItemOrigin,
  returnHistoryDelta,
  validReturnHref,
} from "./navigation.ts";

it("keeps only finite nonnegative positions of the four actual board columns", () => {
  const origin = readItemOrigin({
    href: "/p/HC",
    index: 1,
    columnScroll: { todo: 0, doing: 174, check: 23, done: 0, unrelated: 999 },
  });
  assert.deepEqual(origin?.columnScroll, { todo: 0, doing: 174, check: 23, done: 0 });
  assert.equal(readItemOrigin({ href: "/p/HC", index: 1 })?.columnScroll, undefined);
});

it("does not restore column scroll from arrays, negative, nonfinite or wrong scalar positions", () => {
  for (const columnScroll of [[174], "174", { todo: -1, doing: Infinity, check: "23", done: {} }]) {
    assert.equal(
      readItemOrigin({ href: "/p/HC", index: 1, columnScroll })?.columnScroll,
      undefined,
    );
  }
});

it("accepts same-app source views with filters, never detail-to-detail return loops", () => {
  for (const href of [
    "/",
    "/me",
    "/inbox",
    "/p/HC/issues?query=HC-141&mine=true",
    "/p/HC?board=b-hc-main&cancelled=true",
  ])
    assert.equal(validReturnHref(href), true, href);
  for (const href of [
    "https://example.com",
    "//example.com",
    "/\\evil",
    "/p/HC/items/HC-141",
    "/unknown",
    "/p/HC\n/issues",
  ])
    assert.equal(validReturnHref(href), false, href);
});

it("recognizes only an item route", () => {
  assert.equal(isItemPath("/p/HC/items/HC-141"), true);
  assert.equal(isItemPath("/p/HC/items/HC-141/"), true);
  assert.equal(isItemPath("/p/HC/issues"), false);
  assert.equal(isItemPath("/p/HC/items/HC-141/nested"), false);
});

it("validates history state before navigation or focus restoration", () => {
  for (const value of [
    undefined,
    null,
    "bad",
    {},
    { href: "//evil", index: 0 },
    { href: "/inbox", index: -1 },
    { href: "/inbox", index: 1.2 },
    { href: "/inbox", index: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.equal(readItemOrigin(value), undefined);
});

it("keeps trusted focus and scroll but discards malformed optional state", () => {
  const origin = readItemOrigin({
    href: "/p/HC/issues",
    index: 4,
    focus: { key: "item-key:x", label: "HC-141", text: "标题", tag: "BUTTON" },
    scrollTop: 120,
    scrollLeft: 240,
  });
  assert.deepEqual(origin, {
    href: "/p/HC/issues",
    index: 4,
    focus: { key: "item-key:x", label: "HC-141", text: "标题", tag: "BUTTON" },
    scrollTop: 120,
    scrollLeft: 240,
  });
  const malformed = readItemOrigin({
    href: "/inbox",
    index: 0,
    focus: { key: {}, label: "x".repeat(301), text: 10, tag: "SCRIPT" },
    scrollTop: Infinity,
    scrollLeft: -2,
  });
  assert.equal(malformed?.scrollTop, 0);
  assert.equal(malformed?.scrollLeft, 0);
  assert.deepEqual(malformed?.focus, {
    key: undefined,
    label: undefined,
    text: undefined,
    tag: undefined,
  });
});

it("returns across successive details to the first source history entry", () => {
  const origin = readItemOrigin({ href: "/p/HC/issues?query=HC", index: 2 });
  assert.equal(returnHistoryDelta(origin, 3), -1);
  assert.equal(returnHistoryDelta(origin, 5), -3);
});

it("falls back for deep links, future or equal indices and invalid current indices", () => {
  const origin = readItemOrigin({ href: "/me", index: 2 });
  for (const index of [0, 2, NaN, Infinity, 2.5])
    assert.equal(returnHistoryDelta(origin, index), undefined);
  assert.equal(returnHistoryDelta(undefined, 5), undefined);
});

it("preserves explicit false filters and an empty sprint without truthy coercion", () => {
  assert.deepEqual(
    parseProjectViewSearch({
      query: "HC-141",
      kind: "task",
      mine: false,
      hideDone: false,
      board: "main",
      sprint: "",
      cancelled: true,
      assignees: ["u-lin", "u-zhou"],
      tag: "测试",
      sort: "points",
      ascending: false,
    }),
    {
      query: "HC-141",
      kind: "task",
      mine: false,
      hideDone: false,
      board: "main",
      sprint: "",
      cancelled: true,
      assignees: ["u-lin", "u-zhou"],
      tag: "测试",
      sort: "points",
      ascending: false,
    },
  );
});

it("does not trust arrays, objects or string booleans as filter values", () => {
  assert.deepEqual(
    parseProjectViewSearch({
      query: [],
      kind: { toString: () => "task" },
      mine: "false",
      hideDone: 1,
      board: {},
      sprint: null,
      cancelled: "true",
      assignees: ["u-lin", {}],
      tag: {},
      sort: "unsupported",
      ascending: "false",
    }),
    {
      query: undefined,
      kind: undefined,
      mine: undefined,
      hideDone: undefined,
      board: undefined,
      sprint: undefined,
      cancelled: undefined,
      assignees: undefined,
      tag: undefined,
      sort: undefined,
      ascending: undefined,
    },
  );
});

it("retains a source browse-order snapshot and rejects malformed IDs", () => {
  const ids = ["it-102", "it-118", "it-128"];
  const origin = readItemOrigin({ href: "/p/HC/issues?sort=key", index: 2, browseIds: ids });
  assert.deepEqual(origin?.browseIds, ids);
  ids.reverse();
  assert.deepEqual(origin?.browseIds, ["it-102", "it-118", "it-128"]);
  for (const browseIds of ["bad", {}, ["it-102", {}], ["x".repeat(301)]]) {
    assert.equal(
      readItemOrigin({ href: "/p/HC/issues", index: 2, browseIds })?.browseIds,
      undefined,
    );
  }
});
