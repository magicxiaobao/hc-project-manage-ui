import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { MENU_OPEN_TYPES, MENU_TYPES, menuEnumLabel } from "@/lib/menu-form";
import { flattenMenuTree, type MenuTreeNode } from "@/lib/menu-tree";

export function MenuTree({
  nodes,
  expanded,
  onToggle,
  actions,
  label = "菜单管理树",
}: {
  nodes: MenuTreeNode[];
  expanded: ReadonlySet<number>;
  onToggle: (id: number) => void;
  actions?: (node: MenuTreeNode) => ReactNode;
  label?: string;
}) {
  const rows = flattenMenuTree(nodes, expanded);
  return (
    <div className="overflow-x-auto rounded-lg border border-default-200">
      <table className="w-full text-left text-sm" aria-label={label}>
        <thead>
          <tr>
            {[
              "名称",
              "类型",
              "path",
              "icon",
              "打开方式",
              "uri",
              "permission",
              ...(actions ? ["操作"] : []),
            ].map((title) => (
              <th key={title} className="whitespace-nowrap bg-default-100 px-3 py-3">
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, depth }) => (
            <tr key={node.id} className="border-t border-default-200">
              <td className="whitespace-nowrap px-3 py-3">
                <div style={{ paddingLeft: depth * 24 }} className="flex items-center gap-1">
                  {node.children.length ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${expanded.has(node.id) ? "折叠" : "展开"}${node.name ?? "未命名"} (#${node.id})`}
                      aria-expanded={expanded.has(node.id)}
                      onPress={() => onToggle(node.id)}
                    >
                      {expanded.has(node.id) ? "−" : "+"}
                    </Button>
                  ) : null}
                  <span>
                    {node.name || "未命名"} <span className="text-default-500">#{node.id}</span>
                  </span>
                </div>
              </td>
              <td className="px-3 py-3">{menuEnumLabel(node.type, MENU_TYPES)}</td>
              {[node.path, node.icon].map((value, index) => (
                <td key={index} className="px-3 py-3">
                  {value || "—"}
                </td>
              ))}
              <td className="px-3 py-3">{menuEnumLabel(node.openType, MENU_OPEN_TYPES)}</td>
              {[node.uri, node.permission].map((value, index) => (
                <td key={index} className="px-3 py-3">
                  {value || "—"}
                </td>
              ))}
              {actions ? <td className="px-3 py-3">{actions(node)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="py-8 text-center text-default-500">暂无菜单</p> : null}
    </div>
  );
}
