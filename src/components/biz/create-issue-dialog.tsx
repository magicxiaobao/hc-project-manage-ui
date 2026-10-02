import { useItemNavigationState } from "@/components/pm/use-go-item";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useEffect, useState } from "react";
import { AppModal } from "@/components/biz/app-modal";
import {
  DefectTypeSelect,
  KindSelect,
  PersonSelect,
  PrioritySelect,
  ProjectSelect,
  RequirementTypeSelect,
  SeveritySelect,
  SprintSelect,
  TaskTypeSelect,
} from "@/components/biz/field-selects";
import { LabeledField } from "@/components/biz/labeled-field";
import type { ItemKind, Priority } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

const empty = {
  kind: "requirement" as ItemKind,
  requirementType: "Story" as "Epic" | "Story" | "Task",
  taskType: "开发任务",
  defectType: "功能缺陷",
  severity: "MAJOR",
  title: "",
  description: "",
  priority: "MEDIUM" as Priority,
  assigneeId: "",
  sprintId: "",
  projectId: "pr-hc",
};

export function CreateIssueDialog() {
  const open = usePm((state) => state.createOpen);
  const projects = usePm((state) => state.projects);
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const itemNavigationState = useItemNavigationState();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const matched = projects.find(
      (project) => pathname === `/p/${project.key}` || pathname.startsWith(`/p/${project.key}/`),
    );
    setForm({ ...empty, projectId: matched?.id ?? projects[0]?.id ?? "pr-hc" });
    setError("");
  }, [open, pathname, projects]);

  if (!open) return null;
  const projectSprints = sprints.filter(
    (sprint) => sprint.projectId === form.projectId && sprint.state !== "closed",
  );

  return (
    <AppModal
      open={open}
      title="创建事项"
      size="lg"
      onClose={() => usePm.getState().setCreateOpen(false)}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.title.trim()) {
            setError("标题不能为空");
            return;
          }
          const id = usePm.getState().createItem({
            projectId: form.projectId,
            kind: form.kind,
            requirementType: form.requirementType,
            taskType: form.taskType,
            defectType: form.defectType,
            severity: form.severity,
            title: form.title,
            description: form.description,
            priority: form.priority,
            assigneeId: form.assigneeId || null,
            sprintId: form.sprintId || null,
          });
          const created = usePm.getState().items.find((entry) => entry.id === id);
          const project = projects.find((entry) => entry.id === created?.projectId);
          if (created && project) {
            void navigate({
              to: "/p/$projectKey/items/$itemKey",
              params: { projectKey: project.key, itemKey: created.key },
              state: itemNavigationState,
            });
          }
        }}
      >
        <p className="type-caption">
          需求从草稿开始，任务从待开始开始，缺陷从新建开始。按 C 也可以打开这个窗口。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledField label="项目">
            <ProjectSelect
              projects={projects}
              value={form.projectId}
              onChange={(projectId) => setForm({ ...form, projectId, sprintId: "" })}
            />
          </LabeledField>
          <LabeledField label="类型">
            <KindSelect
              value={form.kind}
              onChange={(kind) => setForm({ ...form, kind: kind as ItemKind })}
            />
          </LabeledField>
          {form.kind === "requirement" ? (
            <LabeledField label="需求类型">
              <RequirementTypeSelect
                value={form.requirementType}
                onChange={(requirementType) => setForm({ ...form, requirementType })}
              />
            </LabeledField>
          ) : null}
          {form.kind === "task" ? (
            <LabeledField label="任务类型">
              <TaskTypeSelect
                value={form.taskType}
                onChange={(taskType) => setForm({ ...form, taskType })}
              />
            </LabeledField>
          ) : null}
          {form.kind === "defect" ? (
            <>
              <LabeledField label="缺陷类型">
                <DefectTypeSelect
                  value={form.defectType}
                  onChange={(defectType) => setForm({ ...form, defectType })}
                />
              </LabeledField>
              <LabeledField label="严重程度">
                <SeveritySelect
                  value={form.severity}
                  onChange={(severity) => setForm({ ...form, severity })}
                />
              </LabeledField>
            </>
          ) : null}
          <LabeledField label="优先级">
            <PrioritySelect
              value={form.priority}
              onChange={(priority) => setForm({ ...form, priority })}
            />
          </LabeledField>
          <LabeledField label="负责人">
            <PersonSelect
              people={people}
              value={form.assigneeId}
              onChange={(assigneeId) => setForm({ ...form, assigneeId })}
            />
          </LabeledField>
          <LabeledField label="迭代">
            <SprintSelect
              sprints={projectSprints}
              value={form.sprintId}
              emptyLabel="不进迭代"
              showState={false}
              onChange={(sprintId) => setForm({ ...form, sprintId })}
            />
          </LabeledField>
        </div>
        <TextField value={form.title} onChange={(title) => setForm({ ...form, title })} isRequired>
          <Label>标题</Label>
          <Input placeholder="一句话说清要完成什么" />
        </TextField>
        <TextField
          value={form.description}
          onChange={(description) => setForm({ ...form, description })}
        >
          <Label>描述</Label>
          <TextArea rows={4} />
        </TextField>
        {error ? <p className="type-body text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onPress={() => usePm.getState().setCreateOpen(false)}
          >
            取消
          </Button>
          <Button type="submit" variant="primary">
            创建
          </Button>
        </div>
      </form>
    </AppModal>
  );
}
