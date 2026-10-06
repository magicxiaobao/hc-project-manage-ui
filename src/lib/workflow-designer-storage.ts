import {
  emptyGraph,
  validateGraph,
  MAX_FILE_BYTES,
  type WorkflowGraph,
  type WorkflowGraphFile,
  type WorkflowError,
  type Result,
} from "./workflow-designer";
export interface GraphStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
/** Canonical field order makes comparison independent of imported JSON key order. */
export function canonicalGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.position.x, y: n.position.y },
      label: n.label,
      description: n.description,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      event: e.event,
      condition: e.condition,
    })),
  };
}
export function serializeGraph(graph: WorkflowGraph): Result<string> {
  try {
    const errors = validateGraph(graph);
    if (errors.length) return { ok: false, errors };
    const file: WorkflowGraphFile = {
      format: "hc-workflow-designer",
      version: 1,
      graph: canonicalGraph(graph),
    };
    const value = JSON.stringify(file, null, 2);
    if (new TextEncoder().encode(value).byteLength > MAX_FILE_BYTES)
      return { ok: false, errors: [{ field: "file", message: "文件最多 1 MiB" }] };
    return { ok: true, value };
  } catch {
    return { ok: false, errors: [{ field: "file", message: "序列化失败" }] };
  }
}
export function deserializeGraph(text: string): Result<WorkflowGraph> {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES)
    return { ok: false, errors: [{ field: "file", message: "文件最多 1 MiB" }] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, errors: [{ field: "file", message: "JSON 解析失败" }] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, errors: [{ field: "file", message: "根必须是对象" }] };
  const root = value as Record<string, unknown>,
    errors: WorkflowError[] = [];
  for (const key of Object.keys(root))
    if (!["format", "version", "graph"].includes(key))
      errors.push({ field: key, message: "未知字段" });
  if (root.format !== "hc-workflow-designer")
    errors.push({ field: "format", message: "不支持此格式，仅接受 hc-workflow-designer" });
  if (root.version !== 1) errors.push({ field: "version", message: "不支持此版本，仅接受 v1" });
  errors.push(...validateGraph(root.graph));
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: canonicalGraph(root.graph as WorkflowGraph) };
}
export async function readGraphFile(
  file: Pick<File, "size" | "arrayBuffer">,
): Promise<Result<WorkflowGraph>> {
  if (file.size > MAX_FILE_BYTES)
    return { ok: false, errors: [{ field: "file", message: "文件最多 1 MiB" }] };
  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_FILE_BYTES)
      return { ok: false, errors: [{ field: "file", message: "文件最多 1 MiB" }] };
    return deserializeGraph(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, errors: [{ field: "file", message: "无法读取 UTF-8 JSON 文件" }] };
  }
}
export function storageKey(userId: string | null): string | null {
  return typeof userId === "string" &&
    /^[1-9]\d*$/.test(userId) &&
    Number.isSafeInteger(Number(userId))
    ? `hc-project-manage-ui:workflow-designer:v1:${userId}`
    : null;
}
export interface RestoredGraph {
  graph: WorkflowGraph;
  needsOverwriteConfirm: boolean;
  errors: WorkflowError[];
  restored: boolean;
}
export function restoreGraph(userId: string | null, storage: () => GraphStorage): RestoredGraph {
  const key = storageKey(userId);
  if (!key)
    return {
      graph: emptyGraph(),
      needsOverwriteConfirm: false,
      errors: [{ field: "user", message: "没有合法登录用户 ID，禁止本机读写" }],
      restored: false,
    };
  try {
    const text = storage().getItem(key);
    if (text === null)
      return { graph: emptyGraph(), needsOverwriteConfirm: false, errors: [], restored: false };
    const parsed = deserializeGraph(text);
    if (parsed.ok)
      return { graph: parsed.value, needsOverwriteConfirm: false, errors: [], restored: true };
    return {
      graph: emptyGraph(),
      needsOverwriteConfirm: true,
      errors: parsed.errors,
      restored: false,
    };
  } catch {
    return {
      graph: emptyGraph(),
      needsOverwriteConfirm: true,
      errors: [{ field: "storage", message: "本机记录不可读" }],
      restored: false,
    };
  }
}
/** Caller advances its graph/baseline only after this transaction succeeds. */
export function saveGraph(
  userId: string | null,
  graph: WorkflowGraph,
  storage: () => GraphStorage,
): Result<WorkflowGraph> {
  const key = storageKey(userId);
  if (!key)
    return { ok: false, errors: [{ field: "user", message: "没有合法登录用户 ID，禁止本机读写" }] };
  const serialized = serializeGraph(graph);
  if (!serialized.ok) return serialized;
  try {
    storage().setItem(key, serialized.value);
    return { ok: true, value: canonicalGraph(graph) };
  } catch {
    return {
      ok: false,
      errors: [{ field: "storage", message: "未保存，可导出 JSON 备份（本机容量或权限不足）" }],
    };
  }
}
/** Download preparation is atomic with respect to the caller's draft/model. */
export function downloadGraph(graph: WorkflowGraph): Result<WorkflowGraph> {
  const serialized = serializeGraph(graph);
  if (!serialized.ok) return serialized;
  let url: string | undefined, anchor: HTMLAnchorElement | undefined;
  try {
    url = URL.createObjectURL(
      new Blob([serialized.value], { type: "application/json;charset=utf-8" }),
    );
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "workflow-graph.json";
    document.body.appendChild(anchor);
    anchor.click();
    return { ok: true, value: graph };
  } catch {
    return { ok: false, errors: [{ field: "file", message: "下载准备失败，图和属性草稿已保留" }] };
  } finally {
    anchor?.remove();
    if (url) {
      const releasedUrl = url;
      setTimeout(() => URL.revokeObjectURL(releasedUrl), 0);
    }
  }
}
