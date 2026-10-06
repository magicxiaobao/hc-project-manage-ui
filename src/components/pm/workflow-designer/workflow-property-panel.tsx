import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { FieldError, RequiredMark } from "@/components/biz/form-guard";
import type { PropertyDraft, WorkflowError, WorkflowGraph } from "@/lib/workflow-designer";
export const fieldId = (field: string) => `workflow-property-${field}`;
export function WorkflowPropertyPanel({
  graph,
  draft,
  errors,
  disabled,
  onChange,
  onApply,
  onCancel,
}: {
  graph: WorkflowGraph;
  draft: PropertyDraft | null;
  errors: WorkflowError[];
  disabled: boolean;
  onChange: (field: string, value: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const edge = graph.edges.find((e) => e.id === draft?.id);
  return (
    <aside
      aria-label="属性面板"
      className="max-h-[680px] w-[280px] shrink-0 overflow-y-auto border p-3"
    >
      <h2 className="mb-3 font-semibold">属性</h2>
      {!draft ? (
        <p>请选择一个状态或流转</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onApply();
          }}
          noValidate
          className="space-y-3"
        >
          <p className="break-all text-xs">ID：{draft.id}</p>
          {draft.kind === "node" ? (
            <p>类型：状态</p>
          ) : (
            <p className="break-all">
              {graph.nodes.find((n) => n.id === edge?.source)?.label} →{" "}
              {graph.nodes.find((n) => n.id === edge?.target)?.label}
              <br />
              源：{edge?.source}
              <br />
              目标：{edge?.target}
            </p>
          )}
          {(draft.kind === "node"
            ? [
                ["label", "状态名称"],
                ["description", "状态描述"],
                ["x", "X"],
                ["y", "Y"],
              ]
            : [
                ["label", "流转标签"],
                ["event", "事件名"],
                ["condition", "流转条件"],
              ]
          ).map(([field, label]) => {
            const required = ["label", "event", "x", "y"].includes(field);
            const error = errors.find((e) => e.field === field)?.message;
            const multiline = field === "description" || field === "condition";
            return (
              <div key={field}>
                <TextField
                  value={draft.values[field]}
                  onChange={(value) => onChange(field, value)}
                  isRequired={required}
                  isDisabled={disabled}
                  isInvalid={!!error}
                >
                  <Label htmlFor={fieldId(field)}>
                    {label}
                    {required && <RequiredMark />}
                  </Label>
                  {multiline ? (
                    <TextArea
                      id={fieldId(field)}
                      aria-label={label}
                      aria-invalid={!!error}
                      aria-describedby={error ? `${fieldId(field)}-error` : undefined}
                    />
                  ) : (
                    <Input
                      id={fieldId(field)}
                      aria-label={label}
                      aria-required={required}
                      aria-invalid={!!error}
                      aria-describedby={error ? `${fieldId(field)}-error` : undefined}
                    />
                  )}
                </TextField>
                <div id={`${fieldId(field)}-error`}>
                  <FieldError message={error} />
                </div>
                {field === "condition" && (
                  <p className="text-xs">仅记录文本，不解析或执行；空值表示未填写条件。</p>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" isDisabled={disabled}>
              应用属性
            </Button>
            <Button isDisabled={disabled} variant="ghost" onPress={onCancel}>
              取消编辑
            </Button>
          </div>
          <p className="text-xs">应用属性后仍需保存到本机。</p>
        </form>
      )}
    </aside>
  );
}
