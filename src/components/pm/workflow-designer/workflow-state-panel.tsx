import { Button } from "@heroui/react";
import type { WorkflowGraph } from "@/lib/workflow-designer";
export function WorkflowStatePanel({
  graph,
  selected,
  disabled,
  onAdd,
  onSelect,
}: {
  graph: WorkflowGraph;
  selected: string | null;
  disabled: boolean;
  onAdd: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      aria-label="状态面板"
      className="max-h-[680px] w-[220px] shrink-0 overflow-y-auto border p-3"
    >
      <h2 className="mb-3 font-semibold">状态</h2>
      <Button isDisabled={disabled} onPress={onAdd}>
        添加状态
      </Button>
      {!graph.nodes.length && <p className="mt-3 text-sm">暂无状态，点击添加状态开始。</p>}
      <ul className="mt-3 space-y-2">
        {graph.nodes.map((node) => (
          <li key={node.id}>
            <Button
              className="w-full justify-start"
              variant="ghost"
              isDisabled={disabled}
              aria-pressed={selected === node.id}
              onPress={() => onSelect(node.id)}
            >
              <span className="truncate">{node.label}</span>
              {selected === node.id && <span>已选中</span>}
            </Button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
