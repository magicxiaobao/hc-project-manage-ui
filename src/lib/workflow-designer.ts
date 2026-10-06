/** Local v1 graph model. No execution semantics or backend DTOs. */
export interface WorkflowStateNode {
  id: string;
  type: "state";
  position: { x: number; y: number };
  label: string;
  description: string;
}
export interface WorkflowTransitionEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  event: string;
  condition: string;
}
export interface WorkflowGraph {
  nodes: WorkflowStateNode[];
  edges: WorkflowTransitionEdge[];
}
export interface WorkflowGraphFile {
  format: "hc-workflow-designer";
  version: 1;
  graph: WorkflowGraph;
}
export interface WorkflowError {
  field: string;
  message: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; errors: WorkflowError[] };
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_NODES = 200;
export const MAX_EDGES = 500;
export const emptyGraph = (): WorkflowGraph => ({ nodes: [], edges: [] });
const snapshot = (g: WorkflowGraph) =>
  JSON.stringify({
    nodes: g.nodes.map((n) => [n.id, n.type, n.position.x, n.position.y, n.label, n.description]),
    edges: g.edges.map((e) => [e.id, e.source, e.target, e.label, e.event, e.condition]),
  });
export const graphEqual = (a: WorkflowGraph, b: WorkflowGraph) => snapshot(a) === snapshot(b);
const failure = (field: string, message: string): Result<never> => ({
  ok: false,
  errors: [{ field, message }],
});
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Collect all recognizable errors; never partially repair an imported graph. */
export function validateGraph(value: unknown): WorkflowError[] {
  const errors: WorkflowError[] = [];
  const error = (field: string, message: string) => errors.push({ field, message });
  const object = (v: unknown, path: string, keys: string[]): v is Record<string, unknown> => {
    if (!record(v)) {
      error(path, "必须是对象");
      return false;
    }
    for (const key of Object.keys(v)) if (!keys.includes(key)) error(`${path}.${key}`, "未知字段");
    return true;
  };
  const text = (v: unknown, path: string, max: number, required = false) => {
    if (typeof v !== "string") error(path, "必须是字符串");
    else if (required && !v.trim()) error(path, "不能为空");
    else if ((required ? v.trim() : v).length > max) error(path, `最多 ${max} 字符`);
  };
  if (!object(value, "graph", ["nodes", "edges"])) return errors;
  const nodes = Array.isArray(value.nodes) ? value.nodes : [];
  const edges = Array.isArray(value.edges) ? value.edges : [];
  if (!Array.isArray(value.nodes)) error("graph.nodes", "必须是数组");
  if (!Array.isArray(value.edges)) error("graph.edges", "必须是数组");
  if (nodes.length > MAX_NODES) error("graph.nodes", `最多 ${MAX_NODES} 个状态`);
  if (edges.length > MAX_EDGES) error("graph.edges", `最多 ${MAX_EDGES} 条流转`);
  const ids = new Set<string>(),
    nodeIds = new Set<string>(),
    directions = new Set<string>();
  const id = (v: unknown, path: string) => {
    if (typeof v !== "string" || !v.trim()) error(path, "ID 必须是非空字符串");
    else {
      if (ids.has(v)) error(path, "ID 重复");
      ids.add(v);
    }
  };
  nodes.forEach((node, index) => {
    const p = `graph.nodes[${index}]`;
    if (!object(node, p, ["id", "type", "position", "label", "description"])) return;
    id(node.id, `${p}.id`);
    if (typeof node.id === "string" && node.id.trim()) nodeIds.add(node.id);
    if (node.type !== "state") error(`${p}.type`, "仅支持 state");
    text(node.label, `${p}.label`, 100, true);
    text(node.description, `${p}.description`, 500);
    if (object(node.position, `${p}.position`, ["x", "y"]))
      for (const key of ["x", "y"])
        if (typeof node.position[key] !== "number" || !Number.isFinite(node.position[key]))
          error(`${p}.position.${key}`, "必须是有限数值");
        else if (Math.abs(node.position[key]) > 1e6)
          error(`${p}.position.${key}`, "坐标超出可用范围（±1000000），请检查导入数据");
  });
  edges.forEach((edge, index) => {
    const p = `graph.edges[${index}]`;
    if (!object(edge, p, ["id", "source", "target", "label", "event", "condition"])) return;
    id(edge.id, `${p}.id`);
    for (const [key, label] of [
      ["source", "源"],
      ["target", "目标"],
    ])
      if (typeof edge[key] !== "string" || !nodeIds.has(edge[key] as string))
        error(`${p}.${key}`, `${label}节点不存在`);
    if (typeof edge.source === "string" && typeof edge.target === "string") {
      if (edge.source === edge.target) error(`${p}.target`, "禁止自连");
      const direction = JSON.stringify([edge.source, edge.target]);
      if (directions.has(direction)) error(p, "同方向流转重复");
      directions.add(direction);
    }
    text(edge.label, `${p}.label`, 100, true);
    text(edge.event, `${p}.event`, 100, true);
    text(edge.condition, `${p}.condition`, 1000);
  });
  return errors;
}
export type GraphAction =
  | { type: "add-node"; id: string; position: { x: number; y: number }; label?: string }
  | { type: "add-edge"; id: string; source: string; target: string }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; position: { x: number; y: number } }
  | {
      type: "node-properties";
      id: string;
      patch: Partial<Pick<WorkflowStateNode, "label" | "description" | "position">>;
    }
  | {
      type: "edge-properties";
      id: string;
      patch: Partial<Pick<WorkflowTransitionEdge, "label" | "event" | "condition">>;
    }
  | { type: "clear" };
export function updateGraph(graph: WorkflowGraph, action: GraphAction): Result<WorkflowGraph> {
  let next: WorkflowGraph;
  const node = "id" in action ? graph.nodes.find((n) => n.id === action.id) : undefined;
  const edge = "id" in action ? graph.edges.find((e) => e.id === action.id) : undefined;
  switch (action.type) {
    case "clear":
      next = emptyGraph();
      break;
    case "add-node":
      next = {
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id: action.id,
            type: "state",
            position: { ...action.position },
            label: action.label?.trim() ?? `状态 ${graph.nodes.length + 1}`,
            description: "",
          },
        ],
      };
      break;
    case "add-edge":
      next = {
        ...graph,
        edges: [
          ...graph.edges,
          {
            id: action.id,
            source: action.source,
            target: action.target,
            label: "流转",
            event: "transition",
            condition: "",
          },
        ],
      };
      break;
    case "delete":
      if (!node && !edge) return failure("id", "对象不存在");
      next = {
        nodes: graph.nodes.filter((n) => n.id !== action.id),
        edges: graph.edges.filter(
          (e) => e.id !== action.id && e.source !== action.id && e.target !== action.id,
        ),
      };
      break;
    case "move":
    case "node-properties":
      if (!node) return failure("id", "状态不存在");
      next = {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id !== action.id
            ? n
            : action.type === "move"
              ? { ...n, position: { ...action.position } }
              : {
                  ...n,
                  label: action.patch.label === undefined ? n.label : action.patch.label.trim(),
                  description: action.patch.description ?? n.description,
                  position: action.patch.position ? { ...action.patch.position } : n.position,
                },
        ),
      };
      break;
    case "edge-properties":
      if (!edge) return failure("id", "流转不存在");
      next = {
        ...graph,
        edges: graph.edges.map((e) =>
          e.id !== action.id
            ? e
            : {
                ...e,
                label: action.patch.label === undefined ? e.label : action.patch.label.trim(),
                event: action.patch.event === undefined ? e.event : action.patch.event.trim(),
                condition: action.patch.condition ?? e.condition,
              },
        ),
      };
      break;
  }
  const errors = validateGraph(next);
  return errors.length ? { ok: false, errors } : { ok: true, value: next };
}
export interface PropertyDraft {
  kind: "node" | "edge";
  id: string;
  values: Record<string, string>;
  baseline: Record<string, string>;
}
export function makeDraft(graph: WorkflowGraph, id: string | null): PropertyDraft | null {
  const n = graph.nodes.find((n) => n.id === id),
    e = graph.edges.find((e) => e.id === id);
  const values: Record<string, string> | null = n
    ? {
        label: n.label,
        description: n.description,
        x: String(n.position.x),
        y: String(n.position.y),
      }
    : e
      ? { label: e.label, event: e.event, condition: e.condition }
      : null;
  return values ? { kind: n ? "node" : "edge", id: id!, values, baseline: { ...values } } : null;
}
export const draftDirty = (d: PropertyDraft | null) =>
  !!d && Object.keys(d.values).some((k) => d.values[k] !== d.baseline[k]);
export function syncDraftPosition(
  d: PropertyDraft | null,
  graph: WorkflowGraph,
): PropertyDraft | null {
  const n = graph.nodes.find((n) => n.id === d?.id);
  if (!d || d.kind !== "node" || !n) return d;
  const values = { ...d.values },
    baseline = { ...d.baseline };
  for (const k of ["x", "y"] as const)
    if (values[k] === baseline[k]) values[k] = baseline[k] = String(n.position[k]);
  return { ...d, values, baseline };
}
export function validateDraft(d: PropertyDraft): WorkflowError[] {
  const errors: WorkflowError[] = [];
  for (const k of d.kind === "node"
    ? ["label", "description", "x", "y"]
    : ["label", "event", "condition"]) {
    const v = d.values[k];
    if (k === "x" || k === "y") {
      if (!v.trim() || !Number.isFinite(Number(v)))
        errors.push({ field: k, message: `${k.toUpperCase()} 必须是有限数值且不能为空` });
    } else {
      const required = k === "label" || k === "event",
        max = k === "description" ? 500 : k === "condition" ? 1000 : 100;
      if (required && !v.trim())
        errors.push({ field: k, message: k === "event" ? "请输入事件名" : "请输入名称或标签" });
      else if ((required ? v.trim() : v).length > max)
        errors.push({ field: k, message: `最多 ${max} 字符` });
    }
  }
  return errors;
}
export function applyDraft(
  graph: WorkflowGraph,
  draft: PropertyDraft | null,
): Result<WorkflowGraph> {
  if (!draft) return { ok: true, value: graph };
  const errors = validateDraft(draft);
  if (errors.length) return { ok: false, errors };
  const changed = (k: string) => draft.values[k] !== draft.baseline[k];
  if (draft.kind === "node") {
    const n = graph.nodes.find((n) => n.id === draft.id);
    if (!n) return failure("id", "状态不存在");
    return updateGraph(graph, {
      type: "node-properties",
      id: draft.id,
      patch: {
        ...(changed("label") ? { label: draft.values.label } : {}),
        ...(changed("description") ? { description: draft.values.description } : {}),
        ...(changed("x") || changed("y")
          ? {
              position: {
                x: changed("x") ? Number(draft.values.x) : n.position.x,
                y: changed("y") ? Number(draft.values.y) : n.position.y,
              },
            }
          : {}),
      },
    });
  }
  return updateGraph(graph, {
    type: "edge-properties",
    id: draft.id,
    patch: Object.fromEntries(
      ["label", "event", "condition"].filter(changed).map((k) => [k, draft.values[k]]),
    ),
  });
}
