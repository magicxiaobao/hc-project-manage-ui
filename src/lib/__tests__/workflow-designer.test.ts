import { describe, it, expect } from "vitest";
import {
  emptyGraph,
  updateGraph,
  applyDraft,
  makeDraft,
  syncDraftPosition,
  draftDirty,
  graphEqual,
  validateDraft,
  validateGraph,
  type WorkflowGraph,
  type Result,
} from "../workflow-designer";
const value = <T>(r: Result<T>): T => {
  if (!r.ok) throw Error(JSON.stringify(r.errors));
  return r.value;
};
const nodes = (): WorkflowGraph =>
  ["a", "b", "c"].reduce(
    (g, id) => value(updateGraph(g, { type: "add-node", id, position: { x: 0, y: -20 } })),
    emptyGraph(),
  );
describe("immutable graph model", () => {
  it.each([1e308, -1e308, 1000001, -1000001])("rejects out-of-range coordinates %s", (coordinate) => {
    const g = nodes();
    g.nodes[0].position = { x: coordinate, y: coordinate };
    expect(validateGraph(g)).toEqual([
      { field: "graph.nodes[0].position.x", message: "坐标超出可用范围（±1000000），请检查导入数据" },
      { field: "graph.nodes[0].position.y", message: "坐标超出可用范围（±1000000），请检查导入数据" },
    ]);
  });
  it("accepts coordinates at both usable range boundaries", () => {
    const g = nodes();
    g.nodes[0].position = { x: 1e6, y: -1e6 };
    expect(validateGraph(g)).toEqual([]);
  });
  it("stable IDs, cascade deletion, reverse edges and cycles", () => {
    const original = nodes(),
      before = structuredClone(original);
    let g = original;
    for (const [source, target] of [
      ["a", "b"],
      ["b", "a"],
      ["b", "c"],
      ["c", "a"],
    ])
      g = value(updateGraph(g, { type: "add-edge", id: source + target, source, target }));
    expect(validateGraph(g)).toEqual([]);
    expect(updateGraph(g, { type: "add-edge", id: "dup", source: "a", target: "b" }).ok).toBe(
      false,
    );
    expect(updateGraph(g, { type: "add-edge", id: "self", source: "a", target: "a" }).ok).toBe(
      false,
    );
    expect(
      updateGraph(g, { type: "add-edge", id: "missing", source: "a", target: "missing" }).ok,
    ).toBe(false);
    expect(updateGraph(g, { type: "add-node", id: "ab", position: { x: 0, y: 0 } }).ok).toBe(false);
    const deleted = value(updateGraph(g, { type: "delete", id: "a" }));
    expect(deleted.edges.map((e) => e.id)).toEqual(["bc"]);
    expect(value(updateGraph(g, { type: "delete", id: "ab" })).nodes).toEqual(g.nodes);
    expect(updateGraph(g, { type: "move", id: "missing", position: { x: 1, y: 2 } }).ok).toBe(
      false,
    );
    expect(updateGraph(g, { type: "delete", id: "missing" }).ok).toBe(false);
    expect(original).toEqual(before);
    expect(value(updateGraph(emptyGraph(), { type: "clear" }))).toEqual(emptyGraph());
  });
  it("draft merges only changed fields, retaining latest positions and raw condition", () => {
    let g = nodes();
    const d = makeDraft(g, "a")!;
    d.values.label = "  新状态  ";
    g = value(updateGraph(g, { type: "move", id: "a", position: { x: 100, y: 80 } }));
    expect(applyDraft(g, d)).toMatchObject({
      ok: true,
      value: { nodes: [{ label: "新状态", position: { x: 100, y: 80 } }, {}, {}] },
    });
    const synced = syncDraftPosition(d, g)!;
    expect(synced.values.x).toBe("100");
    d.values.x = "-8";
    expect(syncDraftPosition(d, g)!.values.x).toBe("-8");
    expect(value(applyDraft(g, d)).nodes[0].position).toEqual({ x: -8, y: 80 });
    g = value(updateGraph(g, { type: "add-edge", id: "ab", source: "a", target: "b" }));
    const edge = makeDraft(g, "ab")!;
    edge.values.condition = '  中文 "条件"\nreturn evil()  ';
    expect(value(applyDraft(g, edge)).edges[0].condition).toBe(edge.values.condition);
  });
  it("collects errors, boundaries, dirty including invalid inputs, revert clean", () => {
    const g = nodes(),
      d = makeDraft(g, "a")!;
    expect(draftDirty(d)).toBe(false);
    d.values.label = " ";
    d.values.x = "";
    d.values.y = "Infinity";
    d.values.description = "x".repeat(501);
    expect(validateDraft(d).map((e) => e.field)).toEqual(["label", "description", "x", "y"]);
    expect(draftDirty(d)).toBe(true);
    expect(applyDraft(g, d).ok).toBe(false);
    d.values = { ...d.baseline };
    expect(draftDirty(d)).toBe(false);
    expect(graphEqual(g, value(applyDraft(g, d)))).toBe(true);
    d.values.label = "x".repeat(100);
    d.values.description = "x".repeat(500);
    d.values.x = "NaN";
    expect(validateDraft(d).map((e) => e.field)).toEqual(["x"]);
    expect(
      validateGraph({ nodes: [{ ...g.nodes[0], position: { x: NaN, y: Infinity } }], edges: [] }),
    ).toHaveLength(2);
  });
});

it("edge required fields and text boundaries collect together; failure never mutates a valid graph", () => {
  const g = value(updateGraph(nodes(), { type: "add-edge", id: "ab", source: "a", target: "b" }));
  const before = structuredClone(g),
    d = makeDraft(g, "ab")!;
  d.values.label = "";
  d.values.event = " ";
  d.values.condition = "x".repeat(1001);
  expect(validateDraft(d).map((e) => e.field)).toEqual(["label", "event", "condition"]);
  expect(applyDraft(g, d).ok).toBe(false);
  expect(g).toEqual(before);
  d.values.label = "x".repeat(100);
  d.values.event = "x".repeat(100);
  d.values.condition = "x".repeat(1000);
  expect(validateDraft(d)).toEqual([]);
  const next = value(applyDraft(g, d));
  expect(next.edges[0].source).toBe("a");
  expect(next.edges[0].target).toBe("b");
  expect(next.edges[0].id).toBe("ab");
  expect(updateGraph(g, { type: "edge-properties", id: "missing", patch: { label: "x" } }).ok).toBe(
    false,
  );
  const reordered = {
    edges: [...g.edges],
    nodes: g.nodes.map((n) => ({
      description: n.description,
      label: n.label,
      id: n.id,
      position: { y: n.position.y, x: n.position.x },
      type: n.type,
    })),
  };
  expect(graphEqual(reordered, g)).toBe(true);
});
