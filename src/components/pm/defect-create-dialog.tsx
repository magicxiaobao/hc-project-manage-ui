/**
 * 缺陷新建弹窗（P2：p2-defect-list-create）。
 *
 * 登录态纯展示组件：
 * - 表单字段按后端 DefectCreateRequest（标题必填/类型/严重度六档/优先级三档/
 *   环境/描述/复现步骤/期望结果/实际结果/关联需求 affectedRequirementIds/
 *   关联任务 foundInTaskIds，ID 栏逗号分隔）
 * - 提交走 POST /defect/v1/createDefect（useCreateDefect），成功后 toast + 关闭，
 *   列表缓存已失效，下次读取即出现新缺陷
 * - 关联需求/任务为直输 ID 栏（逗号分隔），非法 token 即时报错并保留输入
 *   （复用 task-create 的 addByIds 教训：回车即按"添加"处理，不直接提交整单）
 *
 * 未登录走演示创建流程时不使用本组件。
 */
import { useState } from "react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, OptionSelect } from "@/components/biz";
import { severityLabel } from "@/components/biz/severity";
import { priorityLabel } from "@/lib/pm/domain";
import { toUserMessage, useCreateDefect } from "@/lib/query";
import {
  buildDefectCreatePayload,
  emptyDefectCreateFormInput,
  parseIdListText,
  validateDefectCreateInput,
} from "@/lib/defect-create";
import { DEFECT_PRIORITIES, DEFECT_SEVERITIES } from "@/lib/api/defect-types";

const SEVERITY_OPTIONS = DEFECT_SEVERITIES.map((severity) => ({
  id: severity,
  label: severityLabel(severity),
}));

const PRIORITY_OPTIONS = DEFECT_PRIORITIES.map((priority) => ({
  id: priority,
  label: priorityLabel(priority),
}));

/**
 * 关联 ID 直输栏：逗号分隔的缺陷/任务 ID，非法 token 即时报错并保留输入。
 * 回车时先把输入解析进已选列表（不直接提交整单）。
 */
function RelatedIdField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const selectedSet = new Set(value);

  const handleInputChange = (next: string) => {
    setInput(next);
    setError("");
  };

  const addByIds = () => {
    const { ids, invalid } = parseIdListText(input);
    if (invalid.length > 0) {
      setError(`以下 ID 格式非法，请只输入逗号分隔的正整数 ID：${invalid.join("、")}`);
      return;
    }
    if (ids.length === 0) return;
    onChange([...value, ...ids.filter((id) => !selectedSet.has(id))]);
    setInput("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex gap-2"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addByIds();
          }
        }}
      >
        <div className="flex-1">
          <TextField value={input} onChange={handleInputChange} aria-label={label}>
            <Label>{label}</Label>
            <Input placeholder={placeholder} />
          </TextField>
        </div>
        <Button type="button" variant="ghost" size="sm" onPress={addByIds}>
          添加
        </Button>
      </div>
      {error ? <p className="type-body text-danger">{error}</p> : null}
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`移除 ${id}`}
              onPress={() => onChange(value.filter((current) => current !== id))}
            >
              #{id} ×
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DefectCreateDialog({
  open,
  projectId,
  onClose,
}: {
  open: boolean;
  projectId: number;
  onClose: () => void;
}) {
  const createDefect = useCreateDefect();
  const [form, setForm] = useState(emptyDefectCreateFormInput());
  const [relatedRequirementIds, setRelatedRequirementIds] = useState<number[]>([]);
  const [relatedTaskIds, setRelatedTaskIds] = useState<number[]>([]);
  const [formError, setFormError] = useState("");

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const close = () => {
    setForm(emptyDefectCreateFormInput());
    setRelatedRequirementIds([]);
    setRelatedTaskIds([]);
    setFormError("");
    onClose();
  };

  const handleSubmit = () => {
    const input = {
      ...form,
      affectedRequirementIdsText: relatedRequirementIds.join(","),
      foundInTaskIdsText: relatedTaskIds.join(","),
    };
    const errors = validateDefectCreateInput(input);
    if (errors.length > 0) {
      setFormError(errors.join("；"));
      return;
    }
    setFormError("");
    createDefect.mutate(buildDefectCreatePayload(input, projectId), {
      onSuccess: (id) => {
        toast.success(`缺陷已创建（#${id}）`);
        close();
      },
      onError: (error) => {
        setFormError(`创建失败：${toUserMessage(error)}`);
      },
    });
  };

  return (
    <AppModal open={open} title="新建缺陷" onClose={close} size="lg">
      <div className="flex flex-col gap-4">
        <TextField value={form.title} onChange={(next) => set({ title: next })} aria-label="标题">
          <Label>标题（必填）</Label>
          <Input placeholder="缺陷标题" />
        </TextField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField value={form.defectType} onChange={(next) => set({ defectType: next })} aria-label="缺陷类型">
            <Label>类型</Label>
            <Input placeholder="如 功能/界面/性能" />
          </TextField>
          <OptionSelect
            label="严重度"
            value={form.severity}
            options={SEVERITY_OPTIONS}
            onChange={(next) => set({ severity: next })}
          />
          <OptionSelect
            label="优先级"
            value={form.priority}
            options={PRIORITY_OPTIONS}
            onChange={(next) => set({ priority: next })}
          />
        </div>

        <TextField value={form.environment} onChange={(next) => set({ environment: next })} aria-label="环境">
          <Label>环境</Label>
          <Input placeholder="如 Chrome 130 / Windows 11" />
        </TextField>

        <TextField value={form.description} onChange={(next) => set({ description: next })} aria-label="描述">
          <Label>描述</Label>
          <TextArea rows={3} placeholder="缺陷描述" />
        </TextField>

        <TextField
          value={form.reproductionSteps}
          onChange={(next) => set({ reproductionSteps: next })}
          aria-label="复现步骤"
        >
          <Label>复现步骤</Label>
          <TextArea rows={3} placeholder="一步一步说明如何复现" />
        </TextField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField value={form.expectedResult} onChange={(next) => set({ expectedResult: next })} aria-label="期望结果">
            <Label>期望结果</Label>
            <TextArea rows={2} placeholder="期望的行为" />
          </TextField>
          <TextField value={form.actualResult} onChange={(next) => set({ actualResult: next })} aria-label="实际结果">
            <Label>实际结果</Label>
            <TextArea rows={2} placeholder="实际发生的行为" />
          </TextField>
        </div>

        <RelatedIdField
          label="关联需求"
          value={relatedRequirementIds}
          onChange={setRelatedRequirementIds}
          placeholder="按 ID 直接添加需求，逗号分隔，如 12,34"
        />
        <RelatedIdField
          label="关联任务"
          value={relatedTaskIds}
          onChange={setRelatedTaskIds}
          placeholder="按 ID 直接添加任务，逗号分隔，如 56,78"
        />

        {formError ? <p className="type-body text-danger">{formError}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={close} isDisabled={createDefect.isPending}>
            取消
          </Button>
          <Button variant="primary" onPress={handleSubmit} isDisabled={createDefect.isPending}>
            {createDefect.isPending ? "创建中…" : "创建"}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
