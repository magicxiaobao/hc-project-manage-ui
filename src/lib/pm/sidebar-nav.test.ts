import assert from "node:assert/strict";
import { it } from "node:test";
import { chosenProjectKey, highlightedModule, moduleDestination, projectKeyFromPath, projectLayoutRemountKey } from "./sidebar-nav.ts";

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

it("keeps a chosen project key that is still in the list", () => {
  assert.equal(chosenProjectKey("NEW", [{ key: "HC" }, { key: "NEW" }], "HC"), "NEW");
});

it("falls back to the current project key when the chosen key is gone", () => {
  assert.equal(chosenProjectKey("GONE", [{ key: "HC" }], "HC"), "HC");
});

it("extracts the live project key from a /p/<key> path", () => {
  assert.equal(projectKeyFromPath("/p/OPS2"), "OPS2");
  assert.equal(projectKeyFromPath("/p/OPS2/issues"), "OPS2");
  assert.equal(projectKeyFromPath("/p/OPS2/requirements/3"), "OPS2");
  assert.equal(projectKeyFromPath("/p/OPS2?tab=1"), "OPS2");
  assert.equal(projectKeyFromPath("/projects"), null);
  assert.equal(projectKeyFromPath("/"), null);
  assert.equal(projectKeyFromPath("/p/"), null);
});

it("highlights the parent module on nested live routes (Codex review 4175510489)", () => {
  assert.equal(highlightedModule("/p/OPS2/issues/123", "OPS2", undefined), "issues");
  assert.equal(highlightedModule("/p/OPS2/issues/new", "OPS2", undefined), "issues");
  assert.equal(highlightedModule("/p/OPS2/requirements/123", "OPS2", undefined), "requirements");
  assert.equal(highlightedModule("/p/OPS2/trace/a/b", "OPS2", undefined), "trace");
  assert.equal(highlightedModule("/p/OPS2/issues/123?x=1#y", "OPS2", undefined), "issues");
  assert.equal(highlightedModule("/p/OPS2/nope/123", "OPS2", undefined), undefined);
});
