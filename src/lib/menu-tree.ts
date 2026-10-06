import type { MenuQuery, MenuResponse } from "./api/system-types";
import type { PageRequest, PageResult } from "./api/types";

export const MENU_PAGE_SIZE = 100;
export const isMenuId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;
export type MenuTreeNode = MenuResponse & { children: MenuTreeNode[] };
export interface MenuTreeData {
  roots: MenuTreeNode[];
  anomalies: MenuTreeNode[];
}
const ordered = (a: MenuResponse, b: MenuResponse) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id;

/** No partial result escapes; changing pagination is not a transaction snapshot. */
export async function readAllMenuPages(
  fetchPage: (request: PageRequest<MenuQuery>) => Promise<PageResult<MenuResponse>>,
): Promise<MenuResponse[]> {
  const records = new Map<number, MenuResponse>();
  const signatures = new Set<string>();
  let size: number | null = null;
  let total: number | null = null;
  for (let page = 1; ; page++) {
    const result = await fetchPage({ page, pageSize: MENU_PAGE_SIZE, bean: {} });
    if (
      result.pageNumber !== page ||
      !Number.isSafeInteger(result.pageSize) ||
      result.pageSize <= 0 ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      !Array.isArray(result.list) ||
      (size !== null && size !== result.pageSize) ||
      (total !== null && total !== result.total) ||
      result.list.length !== Math.min(result.pageSize, Math.max(0, result.total - records.size))
    )
      throw new Error("菜单分页数据发生变化或响应异常，请刷新重试");
    size = result.pageSize;
    total = result.total;
    const signature = JSON.stringify(result.list.map((row) => row.id).sort((a, b) => a - b));
    if (result.list.length && signatures.has(signature))
      throw new Error("菜单分页重复，请刷新重试");
    signatures.add(signature);
    for (const row of result.list) {
      if (!isMenuId(row.id) || records.has(row.id))
        throw new Error("菜单 ID 非法或重复，请刷新重试");
      records.set(row.id, row);
    }
    if (records.size === total) return [...records.values()];
    if (!result.list.length) throw new Error("菜单分页未推进，请刷新重试");
  }
}

/** Topology/fields come exclusively from the complete page list, never cached roots. */
export function buildMenuTree(records: MenuResponse[], rootOrder: MenuResponse[]): MenuTreeData {
  const nodes = new Map<number, MenuTreeNode>();
  for (const record of records) {
    if (!isMenuId(record.id) || nodes.has(record.id))
      throw new Error("菜单 ID 非法或重复，请刷新重试");
    nodes.set(record.id, { ...record, children: [] });
  }
  const normal = new Set<number>();
  for (const node of nodes.values()) {
    let current: MenuTreeNode | undefined = node;
    const visited = new Set<number>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.parentId === null || current.parentId === 0 || normal.has(current.id)) {
        visited.forEach((id) => normal.add(id));
        break;
      }
      current = isMenuId(current.parentId) ? nodes.get(current.parentId) : undefined;
    }
  }
  const roots: MenuTreeNode[] = [];
  const anomalies: MenuTreeNode[] = [];
  for (const node of nodes.values()) {
    if (!normal.has(node.id)) anomalies.push(node);
    else if (node.parentId === null || node.parentId === 0) roots.push(node);
    else nodes.get(node.parentId)?.children.push(node);
  }
  nodes.forEach((node) => node.children.sort(ordered));
  roots.sort(ordered);
  const preferred = new Map<number, number>();
  rootOrder.forEach((row, index) => {
    if (!preferred.has(row.id)) preferred.set(row.id, index);
  });
  roots.sort(
    (a, b) =>
      (preferred.get(a.id) ?? Infinity) - (preferred.get(b.id) ?? Infinity) || ordered(a, b),
  );
  return { roots, anomalies: anomalies.sort(ordered) };
}
export function flattenMenuTree(nodes: MenuTreeNode[], expanded?: ReadonlySet<number>) {
  const result: { node: MenuTreeNode; depth: number }[] = [];
  const visited = new Set<number>();
  const walk = (rows: MenuTreeNode[], depth: number) => {
    for (const node of rows) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      result.push({ node, depth });
      if (!expanded || expanded.has(node.id)) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return result;
}
export function menuParentOptions(
  tree: MenuTreeData,
  records: MenuResponse[],
  selfId: number | null,
) {
  const excluded = new Set<number>();
  if (selfId !== null) {
    excluded.add(selfId);
    // Raw relationships also exclude descendants of anomalous records.
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of records) {
        if (row.parentId !== null && excluded.has(row.parentId) && !excluded.has(row.id)) {
          excluded.add(row.id);
          changed = true;
        }
      }
    }
  }
  return [
    { id: "0", label: "顶级菜单" },
    ...flattenMenuTree(tree.roots)
      .filter(({ node }) => (node.type === 1 || node.type === 2) && !excluded.has(node.id))
      .map(({ node, depth }) => ({
        id: String(node.id),
        label: `${"　".repeat(depth)}${node.name ?? "未命名"} (#${node.id})`,
      })),
  ];
}
