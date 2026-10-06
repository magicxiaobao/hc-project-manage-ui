import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WorkflowCanvas,
  edgeGeometry,
  fitView,
  initialView,
} from "../workflow-designer/workflow-canvas";
import { WorkflowStatePanel } from "../workflow-designer/workflow-state-panel";
import { emptyGraph, updateGraph, type Result, type WorkflowGraph } from "@/lib/workflow-designer";
const value = <T,>(r: Result<T>): T => {
  if (!r.ok) throw Error();
  return r.value;
};
const fixture = (): WorkflowGraph => {
  let g = emptyGraph();
  g = value(
    updateGraph(g, {
      type: "add-node",
      id: "a",
      label: "名称很长很长很长很长很长很长",
      position: { x: -40, y: 20 },
    }),
  );
  g = value(updateGraph(g, { type: "add-node", id: "b", position: { x: 280, y: 200 } }));
  for (const [source, target] of [
    ["a", "b"],
    ["b", "a"],
  ])
    g = value(updateGraph(g, { type: "add-edge", id: source + target, source, target }));
  return g;
};
it("empty and populated SVG has keyboard nodes, edges, arrows and explicit selection", () => {
  const props = { selected: null, view: initialView(), onSelect: () => {} };
  const empty = renderToStaticMarkup(<WorkflowCanvas {...props} graph={emptyGraph()} />);
  expect(empty).toContain("工作流画布");
  expect(empty).not.toContain("data-node-id");
  const html = renderToStaticMarkup(
    <WorkflowCanvas {...props} graph={fixture()} selected="a" source="b" />,
  );
  expect(html.match(/data-node-id=/g)).toHaveLength(2);
  expect(html.match(/data-edge-id=/g)).toHaveLength(2);
  expect(html).toContain("marker-end");
  expect(html).toContain("已选中");
  expect(html).toContain("流转起点");
  expect(html).toContain("…");
  expect(edgeGeometry(fixture(), "a", "b")!.path).not.toBe(edgeGeometry(fixture(), "b", "a")!.path);
});
it("state panel has explicit empty state and selectable list; fit supports far nodes and empty reset", () => {
  expect(
    renderToStaticMarkup(
      <WorkflowStatePanel
        graph={emptyGraph()}
        selected={null}
        disabled={false}
        onAdd={() => {}}
        onSelect={() => {}}
      />,
    ),
  ).toContain("暂无状态");
  const g = fixture();
  g.nodes[1].position.x = 100000;
  expect(fitView(g, 800, 540).zoom).toBeLessThan(0.25);
  expect(fitView(emptyGraph(), 800, 540)).toEqual(initialView());
});

import { WorkflowPropertyPanel } from "../workflow-designer/workflow-property-panel";
import { makeDraft, applyDraft, validateDraft } from "@/lib/workflow-designer";
it("property form has empty prompt, RequiredMark and all associated FieldErrors", () => {
  const graph = fixture(),
    props = {
      graph,
      errors: [],
      disabled: false,
      onChange: () => {},
      onApply: () => {},
      onCancel: () => {},
    };
  expect(renderToStaticMarkup(<WorkflowPropertyPanel {...props} draft={null} />)).toContain(
    "请选择一个状态或流转",
  );
  const draft = makeDraft(graph, "a")!;
  draft.values.label = "";
  draft.values.x = "";
  draft.values.y = "NaN";
  const errors = validateDraft(draft);
  const html = renderToStaticMarkup(
    <WorkflowPropertyPanel {...props} draft={draft} errors={errors} />,
  );
  expect(html.match(/role="alert"/g)).toHaveLength(3);
  expect(html.match(/（必填）/g)).toHaveLength(3);
  expect(html).toContain('aria-describedby="workflow-property-x-error"');
  expect(applyDraft(graph, draft).ok).toBe(false);
  expect(graph.nodes[0].label).not.toBe("");
});
