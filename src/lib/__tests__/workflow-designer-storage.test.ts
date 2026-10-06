import { it, expect, vi } from "vitest";
import {
  deserializeGraph,
  serializeGraph,
  restoreGraph,
  saveGraph,
  storageKey,
  readGraphFile,
} from "../workflow-designer-storage";
import { emptyGraph, MAX_FILE_BYTES, type WorkflowGraph, type Result } from "../workflow-designer";
const value = <T>(r: Result<T>): T => {
  if (!r.ok) throw Error(JSON.stringify(r.errors));
  return r.value;
};
const graph = (): WorkflowGraph => ({
  nodes: ["a", "b"].map((id, i) => ({
    id,
    type: "state",
    position: { x: -12.5 + i * 300, y: 0 },
    label: `中文"${id}`,
    description: "换行\n描述",
  })),
  edges: [
    {
      id: "ab",
      source: "a",
      target: "b",
      label: "流转",
      event: "中文事件",
      condition: '  "引号"\n<script>原文</script>  ',
    },
    { id: "ba", source: "b", target: "a", label: "返回", event: "return", condition: "" },
  ],
});
const file = (g: unknown = graph()) => ({ format: "hc-workflow-designer", version: 1, graph: g });
const parsed = (v: unknown) => deserializeGraph(JSON.stringify(v));
it("round-trip preserves IDs/order/all text/positions including empty graph and reordered object keys", () => {
  for (const g of [graph(), emptyGraph()])
    expect(value(deserializeGraph(value(serializeGraph(g))))).toEqual(g);
  const g = graph();
  const node = g.nodes[0];
  g.nodes[0] = {
    description: node.description,
    label: node.label,
    position: { y: 0, x: -12.5 },
    type: node.type,
    id: node.id,
  };
  expect(value(parsed(file(g)))).toEqual(graph());
});
it("rejects all structure/type/ID/endpoint/unknown/version/limit errors without partial recovery", () => {
  expect(parsed({ ...file(), version: 2, format: "x6", extra: true })).toMatchObject({
    ok: false,
    errors: [{ field: "extra" }, { field: "format" }, { field: "version" }],
  });
  const g = graph();
  g.nodes[1].id = "a";
  g.edges[0].target = "missing";
  g.nodes[0].description = 5 as never;
  const result = parsed({ ...file(g), extra: 1 });
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining([
        "extra",
        "graph.nodes[0].description",
        "graph.nodes[1].id",
        "graph.edges[0].target",
      ]),
    );
  for (const input of [
    null,
    [],
    {},
    { ...file(), graph: { nodes: {}, edges: [] } },
    { ...file(), graph: { nodes: [{ ...graph().nodes[0], extra: true }], edges: [] } },
  ])
    expect(parsed(input).ok).toBe(false);
  const many = Array.from({ length: 201 }, (_, i) => ({ ...graph().nodes[0], id: `n${i}` }));
  expect(parsed(file({ nodes: many, edges: [] }))).toMatchObject({
    ok: false,
    errors: [{ field: "graph.nodes" }],
  });
  expect(parsed(file({ nodes: [], edges: Array(501).fill({}) })).ok).toBe(false);
  expect(deserializeGraph("not json").ok).toBe(false);
  expect(deserializeGraph(" ".repeat(MAX_FILE_BYTES + 1))).toMatchObject({
    ok: false,
    errors: [{ field: "file", message: "文件最多 1 MiB" }],
  });
});
it("isolates user keys, rejects missing user; corrupt/unknown/unreadable records remain untouched", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, v);
    }),
  };
  expect(restoreGraph(null, () => storage).graph).toEqual(emptyGraph());
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(saveGraph(null, graph(), () => storage).ok).toBe(false);
  expect(saveGraph("1", graph(), () => storage).ok).toBe(true);
  expect(restoreGraph("2", () => storage).graph).toEqual(emptyGraph());
  expect(restoreGraph("1", () => storage).graph).toEqual(graph());
  for (const raw of ["broken", JSON.stringify({ ...file(), version: 3 })]) {
    data.set(storageKey("1")!, raw);
    expect(restoreGraph("1", () => storage)).toMatchObject({
      graph: emptyGraph(),
      needsOverwriteConfirm: true,
    });
    expect(data.get(storageKey("1")!)).toBe(raw);
  }
  const before = storage.setItem.mock.calls.length;
  expect(
    restoreGraph("1", () => {
      throw Error();
    }).needsOverwriteConfirm,
  ).toBe(true);
  serializeGraph(graph());
  parsed(file());
  expect(storage.setItem.mock.calls).toHaveLength(before);
  expect(
    saveGraph("1", graph(), () => ({
      getItem: storage.getItem,
      setItem: () => {
        throw Error();
      },
    })).ok,
  ).toBe(false);
});
it("file reader enforces byte limit and UTF-8 rather than extension", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(file())).buffer;
  expect(
    value(await readGraphFile({ size: bytes.byteLength, arrayBuffer: async () => bytes })),
  ).toEqual(graph());
  expect(
    (await readGraphFile({ size: MAX_FILE_BYTES + 1, arrayBuffer: async () => bytes })).ok,
  ).toBe(false);
  expect(
    (await readGraphFile({ size: 1, arrayBuffer: async () => new Uint8Array([0xff]).buffer })).ok,
  ).toBe(false);
  expect(
    (
      await readGraphFile({
        size: 1,
        arrayBuffer: async () => {
          throw Error();
        },
      })
    ).ok,
  ).toBe(false);
});

it("rejects self/repeated directions, nested unknown fields, primitive and incomplete records", () => {
  const malformed = graph();
  malformed.nodes[0].position = { x: 1, y: 1, extra: 5 } as never;
  malformed.edges.push({ ...malformed.edges[0], id: "duplicate-direction" });
  malformed.edges.push({ ...malformed.edges[0], id: "self", target: "a" });
  malformed.edges.push(null as never);
  const result = parsed(file(malformed));
  expect(result.ok).toBe(false);
  if (!result.ok)
    expect(result.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining([
        "graph.nodes[0].position.extra",
        "graph.edges[2]",
        "graph.edges[3].target",
        "graph.edges[4]",
      ]),
    );
  expect(storageKey("")).toBeNull();
  expect(storageKey("01")).toBeNull();
  expect(storageKey("anonymous")).toBeNull();
  expect(storageKey("9007199254740992")).toBeNull();
});
