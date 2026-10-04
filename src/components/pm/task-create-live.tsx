/**
 * 任务新建（P1：p1-task-create）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 表单字段按后端 TaskCreateRequest（标题/类型/优先级/描述/故事点/父任务/
 *   执行人/报告人/起止日期/预估工时/标签/关联需求 implementsRequirementIds）
 * - 提交走 POST /task/v1/createTask（useCreateTask），成功后跳回任务列表
 *   （列表缓存已失效，下次读取即出现新任务）
 * - 关联需求：本项目的需求选择器（标题搜索 + 勾选），另支持按 ID 直接添加
 * - 计划日期为 LocalDate 'yyyy-MM-dd' 直接透传（见 src/lib/task-create.ts）
 *
 * 未登录走演示创建流程时不使用本组件。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Checkbox, Input, Label, Spinner, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { EmptyHint, OptionSelect, PageHeading } from "@/components/biz";
import { priorityLabel } from "@/lib/pm/domain";
import { toUserMessage, useCreateTask, useRequirementList } from "@/lib/query";
import {
  buildTaskCreatePayload,
  emptyTaskCreateFormInput,
  parseRequiredPositiveInt,
  validateTaskCreateInput,
} from "@/lib/task-create";
import { TASK_PRIORITIES } from "@/lib/api/task-types";

const PRIORITY_OPTIONS = TASK_PRIORITIES.map((priority) => ({
  id: priority,
  label: priorityLabel(priority),
}));

/** 日期 ISO（yyyy-MM-dd）输入：原生 date 输入，可留空 */
function IsoDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  return (
    <TextField value={value} onChange={onChange}>
      <Label>{label}</Label>
      <Input type="date" />
    </TextField>
  );
}

/** 数字 ID 输入：执行人/报告人/父任务（后端用户 ID），空表示不填 */
function IdInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextField value={value} onChange={onChange} aria-label={label}>
      <Label>{label}</Label>
      <Input inputMode="numeric" placeholder={placeholder} />
    </TextField>
  );
}

/**
 * 关联需求选择器：本项目需求（标题搜索 + 勾选）+ 按 ID 直接添加。
 * 老前端 TaskCreate.vue 用远程搜索 + 无限滚动；此处用"首 50 条 + 标题搜索 +
 * 按 ID 直接添加"覆盖同等能力，分页加载更多延后到 P1 收尾时再评估。
 */
function RequirementPicker({
  projectId,
  selected,
  onChange,
}: {
  projectId: number;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [idInput, setIdInput] = useState("");
  // Codex review 4175583406：直输 ID 栏的非法 token 不再静默丢弃；任一非法就
  // 报错并保留输入，防止用户以为全部关联成功（输入变化时清除报错）。
  const [idError, setIdError] = useState("");
  const handleIdInputChange = (value: string) => {
    setIdInput(value);
    setIdError("");
  };

  const listQuery = useRequirementList({
    projectId,
    page: 1,
    pageSize: 50,
    bean: appliedTitle ? { title: appliedTitle } : {},
  });

  const selectedSet = new Set(selected);
  const toggle = (id: number) => {
    onChange(selectedSet.has(id) ? selected.filter((current) => current !== id) : [...selected, id]);
  };
  const applySearch = () => setAppliedTitle(searchInput.trim());
  const addByIds = () => {
    const tokens = idInput
      .split(/[,，\s]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const invalid = tokens.filter((token) => parseRequiredPositiveInt(token) === null);
    if (invalid.length > 0) {
      setIdError(`以下 ID 格式非法，请只输入逗号分隔的正整数 ID：${invalid.join("、")}`);
      return;
    }
    const ids = tokens.map((token) => Number(token));
    if (ids.length === 0) return;
    setIdError("");
    const merged = new Set([...selected, ...ids]);
    onChange([...merged]);
    setIdInput("");
  };

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border p-3">
      <Label>关联需求（可选）</Label>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-sm bg-default-100 px-2 py-0.5 text-xs"
            >
              #{id}
              <button
                type="button"
                aria-label={`移除需求 ${id}`}
                className="text-default-500 hover:text-danger"
                onClick={() => toggle(id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {/*
        注意：此处不能再套一层 <form>。嵌套表单的 submit 事件会冒泡到外层
        任务表单，在任务字段已填好时按回车会误触发整单创建（Codex 4175265679）。
        因此用 div + 回车键显式触发搜索。
      */}
      <div
        className="flex gap-2"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applySearch();
          }
        }}
      >
        <div className="flex-1">
          <TextField value={searchInput} onChange={setSearchInput} aria-label="按标题搜索需求">
            <Input placeholder="按标题搜索需求，回车确认" />
          </TextField>
        </div>
        <Button type="button" variant="ghost" size="sm" onPress={applySearch}>
          搜索
        </Button>
      </div>
      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-3 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载需求…
        </div>
      ) : null}
      {listQuery.isError ? (
        <p className="type-body text-danger">需求选项加载失败：{toUserMessage(listQuery.error)}</p>
      ) : null}
      {listQuery.isSuccess && listQuery.data.list.length === 0 ? (
        <EmptyHint>本项目暂无需求，或没有匹配标题的需求。</EmptyHint>
      ) : null}
      {listQuery.isSuccess && listQuery.data.list.length > 0 ? (
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {listQuery.data.list.map((item) => (
            <Checkbox
              key={item.id}
              isSelected={selectedSet.has(item.id)}
              onChange={() => toggle(item.id)}
            >
              <span className="type-body truncate">
                #{item.id} {item.title}
              </span>
            </Checkbox>
          ))}
        </div>
      ) : null}
      {/*
        注意：此处也不能让回车冒泡到外层任务表单。直输 ID 栏不在上面的回车拦截
        包裹范围内（Codex 4175472569）：任务必填字段已填好时在此按回车，会绕过
        addByIds 直接提交整单、丢掉刚输入的 ID。回车即按“添加”处理。
      */}
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
          <TextField value={idInput} onChange={handleIdInputChange} aria-label="按 ID 直接添加需求">
            <Input placeholder="按 ID 直接添加，逗号分隔，如 12,34" />
          </TextField>
        </div>
        <Button type="button" variant="ghost" size="sm" onPress={addByIds}>
          添加
        </Button>
      </div>
      {idError ? <p className="type-body text-danger">{idError}</p> : null}
    </div>
  );
}

export function TaskCreateLive({
  projectId,
  projectKey,
}: {
  projectId: number;
  projectKey: string;
}) {
  const navigate = useNavigate();
  const createTask = useCreateTask();
  const [form, setForm] = useState(emptyTaskCreateFormInput());
  const [formError, setFormError] = useState("");

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  // Codex review 4175693766：路由复用（/p/A/issues/new → /p/B/issues/new）时，
  // A 项目下勾选的关联需求 ID 会残留在表单里，但提交按 B 的 projectId 组装
  // payload——跨项目关联要么被后端拒绝，要么建立错误关联。projectId 变化时
  // 清空 implementsRequirementIds（表单其余字段保留）。选择器子组件的搜索
  // 文本仅控制本项目内的查询，不进 payload，无需处理。
  // Codex review 4175724989：parentIdText 同样是项目作用域的输入（会经
  // buildTaskCreatePayload 序列化为 parentId）——复用组件里 A 项目的父任务
  // 会随表单保留，提交时以 B 的 projectId 配 A 的 parentId，造成跨项目层级
  // 失败或非法关联。一并清空。
  useEffect(() => {
    setForm((current) =>
      current.implementsRequirementIds.length === 0 && current.parentIdText.trim() === ""
        ? current
        : { ...current, implementsRequirementIds: [], parentIdText: "" },
    );
  }, [projectId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const error = validateTaskCreateInput(form);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError("");
    try {
      const payload = buildTaskCreatePayload(form, projectId);
      const id = await createTask.mutateAsync(payload);
      toast.success(`已创建任务 #${id}`);
      void navigate({ to: "/p/$projectKey/issues", params: { projectKey } });
    } catch (submitError) {
      setFormError(toUserMessage(submitError, "创建任务失败"));
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="新建任务"
        hint="直接创建到后端。创建后状态为待开始（由服务端设置），提交后返回任务列表。"
      />
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <TextField value={form.title} onChange={(value) => set({ title: value })}>
          <Label>标题</Label>
          <Input placeholder="一句话说清要做什么" />
        </TextField>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField value={form.taskType} onChange={(value) => set({ taskType: value })}>
            <Label>任务类型</Label>
            <Input placeholder="如：开发 / 联调 / 文档" />
          </TextField>
          <OptionSelect
            label="优先级"
            value={form.priority}
            options={PRIORITY_OPTIONS}
            onChange={(value) => set({ priority: value })}
          />
        </div>
        <TextField value={form.description} onChange={(value) => set({ description: value })}>
          <Label>描述</Label>
          <TextArea placeholder="背景、目标、验收标准（可选）" />
        </TextField>
        <div className="grid gap-3 sm:grid-cols-3">
          <IdInput
            label="执行人用户 ID"
            value={form.assigneeIdText}
            onChange={(value) => set({ assigneeIdText: value })}
            placeholder="后端用户 ID（可选）"
          />
          <IdInput
            label="报告人用户 ID"
            value={form.reporterIdText}
            onChange={(value) => set({ reporterIdText: value })}
            placeholder="后端用户 ID（可选）"
          />
          <IdInput
            label="父任务 ID"
            value={form.parentIdText}
            onChange={(value) => set({ parentIdText: value })}
            placeholder="子任务归属（可选）"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <IsoDateInput label="计划开始日期" value={form.startIso} onChange={(value) => set({ startIso: value })} />
          <IsoDateInput label="计划结束日期" value={form.endIso} onChange={(value) => set({ endIso: value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField value={form.storyPointsText} onChange={(value) => set({ storyPointsText: value })}>
            <Label>故事点</Label>
            <Input inputMode="numeric" placeholder="整数（可选）" />
          </TextField>
          <TextField value={form.estimatedHoursText} onChange={(value) => set({ estimatedHoursText: value })}>
            <Label>预估工时（小时）</Label>
            <Input inputMode="decimal" placeholder="如 2.5（可选）" />
          </TextField>
        </div>
        <TextField value={form.tags} onChange={(value) => set({ tags: value })}>
          <Label>标签</Label>
          <Input placeholder="逗号分隔（可选）" />
        </TextField>
        <RequirementPicker
          projectId={projectId}
          selected={form.implementsRequirementIds}
          onChange={(ids) => set({ implementsRequirementIds: ids })}
        />
        {formError ? <p className="text-xs text-danger">{formError}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" isDisabled={createTask.isPending}>
            {createTask.isPending ? "创建中…" : "创建任务"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onPress={() => void navigate({ to: "/p/$projectKey/issues", params: { projectKey } })}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
