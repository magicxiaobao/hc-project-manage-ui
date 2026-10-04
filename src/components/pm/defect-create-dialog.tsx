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
 *
 * 输入草稿由父组件持有（input/onInputChange/error），以便提交时先 flush 未确认的
 * 草稿：草稿非法则栏内报错并拦截提交，草稿合法则自动并入已选列表后再提交，
 * 避免用户"敲了 ID 但没按回车/添加就点创建"时被静默丢弃。
 */
function RelatedIdField({
  label,
  value,
  onChange,
  placeholder,
  input,
  onInputChange,
  error,
  onErrorChange,
}: {
  label: string;
  value: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
  input: string;
  onInputChange: (next: string) => void;
  error: string;
  onErrorChange: (next: string) => void;
}) {
  const handleInputChange = (next: string) => {
    onInputChange(next);
    onErrorChange("");
  };

  const addByIds = () => {
    const { ids, invalid } = parseIdListText(input);
    if (invalid.length > 0) {
      onErrorChange(`以下 ID 格式非法，请只输入逗号分隔的正整数 ID：${invalid.join("、")}`);
      return false;
    }
    if (ids.length === 0) return true;
    // 本次输入内部也可能重复（"12,12"），合并后整体去重，避免重复 React key 与重复标签
    onChange([...new Set([...value, ...ids])]);
    onInputChange("");
    return true;
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
  // 关联 ID 栏的未确认草稿（父组件持有，提交时 flush）
  const [requirementDraft, setRequirementDraft] = useState("");
  const [requirementDraftError, setRequirementDraftError] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskDraftError, setTaskDraftError] = useState("");
  const [formError, setFormError] = useState("");

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const close = () => {
    // 请求进行中不允许关闭：旧请求的成功/失败回调会重置并关闭重新打开的弹窗，
    // 丢失用户正在填写的新草稿。AppModal 的关闭入口（X/遮罩/Escape）都走这里。
    if (createDefect.isPending) return;
    setForm(emptyDefectCreateFormInput());
    setRelatedRequirementIds([]);
    setRelatedTaskIds([]);
    setRequirementDraft("");
    setRequirementDraftError("");
    setTaskDraft("");
    setTaskDraftError("");
    setFormError("");
    onClose();
  };

  /**
   * 把关联 ID 栏的未确认草稿刷进已选列表：非法则栏内报错并返回 false（拦截提交），
   * 合法则自动并入（并整体去重）后返回合并结果，避免静默丢弃。
   */
  const flushDraft = (
    draft: string,
    value: number[],
    onChange: (ids: number[]) => void,
    onErrorChange: (next: string) => void,
  ): { ok: boolean; merged: number[] } => {
    if (!draft.trim()) return { ok: true, merged: value };
    const { ids, invalid } = parseIdListText(draft);
    if (invalid.length > 0) {
      onErrorChange(`以下 ID 格式非法，请只输入逗号分隔的正整数 ID：${invalid.join("、")}`);
      return { ok: false, merged: value };
    }
    const merged = [...new Set([...value, ...ids])];
    onChange(merged);
    return { ok: true, merged };
  };

  const handleSubmit = () => {
    if (createDefect.isPending) return;
    const flushedRequirements = flushDraft(
      requirementDraft,
      relatedRequirementIds,
      setRelatedRequirementIds,
      setRequirementDraftError,
    );
    const flushedTasks = flushDraft(taskDraft, relatedTaskIds, setRelatedTaskIds, setTaskDraftError);
    if (!flushedRequirements.ok || !flushedTasks.ok) {
      setFormError("关联 ID 栏有未确认的输入，请先修正再提交。");
      return;
    }
    setRequirementDraft("");
    setTaskDraft("");
    const input = {
      ...form,
      affectedRequirementIdsText: flushedRequirements.merged.join(","),
      foundInTaskIdsText: flushedTasks.merged.join(","),
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
          input={requirementDraft}
          onInputChange={setRequirementDraft}
          error={requirementDraftError}
          onErrorChange={setRequirementDraftError}
        />
        <RelatedIdField
          label="关联任务"
          value={relatedTaskIds}
          onChange={setRelatedTaskIds}
          placeholder="按 ID 直接添加任务，逗号分隔，如 56,78"
          input={taskDraft}
          onInputChange={setTaskDraft}
          error={taskDraftError}
          onErrorChange={setTaskDraftError}
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
