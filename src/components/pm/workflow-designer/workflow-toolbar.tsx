import { Button } from "@heroui/react";
import type { Tool, View } from "./workflow-canvas";
export function WorkflowToolbar({
  disabled,
  selected,
  nonempty,
  tool,
  view,
  onTool,
  onDelete,
  onClear,
  onZoom,
  onFit,
  persistence,
}: {
  disabled: boolean;
  selected: boolean;
  nonempty: boolean;
  tool: Tool;
  view: View;
  onTool: (tool: Tool) => void;
  onDelete: () => void;
  onClear: () => void;
  onZoom: (delta: number) => void;
  onFit: () => void;
  persistence?: {
    status: string;
    canSave: boolean;
    importing: boolean;
    onSave: () => void;
    onImport: () => void;
    onCancelImport: () => void;
    onExport: () => void;
  };
}) {
  return (
    <div aria-label="设计器工具栏" className="mb-2 flex flex-wrap items-center gap-2">
      <Button
        isDisabled={disabled}
        aria-pressed={tool === "connect"}
        onPress={() => onTool(tool === "connect" ? "select" : "connect")}
      >
        {tool === "connect" ? "取消连线" : "添加流转"}
      </Button>
      <Button isDisabled={disabled || !selected} onPress={onDelete}>
        删除选中项
      </Button>
      <Button isDisabled={disabled || !nonempty} onPress={onClear}>
        清空
      </Button>
      <Button
        isDisabled={disabled}
        aria-pressed={tool === "pan"}
        onPress={() => onTool(tool === "pan" ? "select" : "pan")}
      >
        平移模式
      </Button>
      <Button isDisabled={disabled || view.zoom >= 2} onPress={() => onZoom(0.1)}>
        放大
      </Button>
      <Button isDisabled={disabled || view.zoom === 0.25} onPress={() => onZoom(-0.1)}>
        缩小
      </Button>
      <span aria-label="缩放比例">{Math.round(view.zoom * 100)}%</span>
      <Button isDisabled={disabled} onPress={onFit}>
        适应内容
      </Button>
      {persistence && (
        <>
          <Button isDisabled={disabled || !persistence.canSave} onPress={persistence.onSave}>
            保存到本机
          </Button>
          <Button isDisabled={disabled} onPress={persistence.onImport}>
            导入 JSON
          </Button>
          <Button isDisabled={disabled} onPress={persistence.onExport}>
            导出 JSON
          </Button>
          {persistence.importing && <Button onPress={persistence.onCancelImport}>取消导入</Button>}
          <span role="status">{persistence.status}</span>
        </>
      )}
    </div>
  );
}
