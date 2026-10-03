import assert from "node:assert/strict";
import { it } from "node:test";
import { highlightedModule, moduleDestination, projectLayoutRemountKey } from "./sidebar-nav.ts";

const origin = (href: string) => ({ href, index: 0, focus: {}, scrollTop: 0, scrollLeft: 0 });

it("highlights the source module on an item page", () => {
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", origin("/p/HC/requirements?q=1#top")), "requirements");
  assert.equal(highlightedModule("/p/HC/items/HC-1/", "HC", origin("/p/HC/defects/")), "defects");
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", origin("/p/HC/trace")), "trace");
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", origin("/p/HC")), "board");
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", origin("/p/HC/")), "board");
});

it("falls back to issues when the origin cannot be used", () => {
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", undefined), "issues");
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", origin("/p/HC/issues")), "issues");
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", origin("/p/OTHER/requirements")), "issues");
  assert.equal(highlightedModule("/p/HC/items/HC-1", "HC", origin("/p/HC/nope")), "issues");
});

it("uses the pathname off the item page and ignores a bare /items/ match", () => {
  assert.equal(highlightedModule("/p/HC/requirements/", "HC", undefined), "requirements");
  assert.equal(highlightedModule("/p/HC/", "HC", undefined), "board");
  assert.equal(highlightedModule("/p/HC/issues", "HC", origin("/p/HC/requirements")), "issues");
});

it("builds the other project's module index without a search", () => {
  assert.equal(moduleDestination("requirements", "OTHER"), "/p/OTHER/requirements");
  assert.equal(moduleDestination("board", "OTHER"), "/p/OTHER");
  assert.equal(moduleDestination("issues", "OTHER"), "/p/OTHER/issues");
});

it("remounts the project layout from the project key", () => {
  assert.equal(projectLayoutRemountKey({ projectKey: "HC" }), "HC");
});
