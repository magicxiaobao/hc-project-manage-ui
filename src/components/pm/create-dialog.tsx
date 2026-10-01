import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

export function CreateDialog() {
  const open = usePm((state) => state.createOpen);
  const projects = usePm((state) => state.projects);
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const matched = projects.find((project) => pathname === `/p/${project.key}` || pathname.startsWith(`/p/${project.key}/`));
    setForm({ ...empty, projectId: matched?.id ?? "pr-hc" });
    setError("");
  }, [open, pathname, projects]);

  if (!open) return null;
  const projectSprints = sprints.filter((sprint) => sprint.projectId === form.projectId && sprint.state !== "closed");

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#091e42]/54 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={() => usePm.getState().setCreateOpen(false)}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        className="flex max-h-screen w-full max-w-[800px] flex-col overflow-auto rounded-t-[3px] bg-surface p-6 sm:rounded-[3px]"
        onMouseDown={(event) => event.stopPropagation()}
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
            void navigate({ to: "/p/$projectKey/items/$itemKey", params: { projectKey: project.key, itemKey: created.key } });
          }
        }}
      >
        <h2 id="create-title" className="text-xl font-medium">
          创建事项
        </h2>
        <p className="mt-1 text-xs text-faint">需求从草稿开始，任务从待开始开始，缺陷从新建开始。按 C 也可以打开这个窗口。</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted">
            项目
            <select className={field} value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value, sprintId: "" })}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key} · {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            类型
            <select className={field} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ItemKind })}>
              <option value="requirement">需求</option>
              <option value="task">任务</option>
              <option value="defect">缺陷</option>
            </select>
          </label>
          {form.kind === "requirement" ? (
            <label className="block text-xs text-muted">
              需求类型
              <select className={field} value={form.requirementType} onChange={(event) => setForm({ ...form, requirementType: event.target.value as "Epic" | "Story" | "Task" })}>
                <option value="Epic">史诗</option>
                <option value="Story">故事</option>
                <option value="Task">需求任务</option>
              </select>
            </label>
          ) : null}
          {form.kind === "task" ? (
            <label className="block text-xs text-muted">
              任务类型
              <select className={field} value={form.taskType} onChange={(event) => setForm({ ...form, taskType: event.target.value })}>
                <option>开发任务</option>
                <option>测试任务</option>
                <option>文档任务</option>
                <option>其他</option>
              </select>
            </label>
          ) : null}
          {form.kind === "defect" ? (
            <>
              <label className="block text-xs text-muted">
                缺陷类型
                <select className={field} value={form.defectType} onChange={(event) => setForm({ ...form, defectType: event.target.value })}>
                  <option>功能缺陷</option>
                  <option>性能缺陷</option>
                  <option>安全缺陷</option>
                  <option>界面缺陷</option>
                  <option>其他</option>
                </select>
              </label>
              <label className="block text-xs text-muted">
                严重程度
                <select className={field} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>
                  <option value="BLOCKER">阻塞</option>
                  <option value="CRITICAL">致命</option>
                  <option value="MAJOR">严重</option>
                  <option value="NORMAL">一般</option>
                  <option value="MINOR">轻微</option>
                  <option value="TRIVIAL">建议</option>
                </select>
              </label>
            </>
          ) : null}
          <label className="block text-xs text-muted">
            优先级
            <select className={field} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>
              <option value="HIGH">高</option>
              <option value="MEDIUM">中</option>
              <option value="LOW">低</option>
            </select>
          </label>
          <label className="block text-xs text-muted">
            负责人
            <select className={field} value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
              <option value="">未分配</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted sm:col-span-2">
            迭代
            <select className={field} value={form.sprintId} onChange={(event) => setForm({ ...form, sprintId: event.target.value })}>
              <option value="">先放进待办，不进迭代</option>
              {projectSprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-xs text-muted">
          标题
          <input className={field} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="一句话说清要完成什么" />
        </label>
        <label className="mt-3 block text-xs text-muted">
          描述
          <textarea className="mt-1 h-24 w-full rounded-md border border-border bg-surface px-2 py-2 text-sm text-fg outline-none focus:border-primary" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-9 rounded-md px-3 text-sm text-muted hover:bg-line" onClick={() => usePm.getState().setCreateOpen(false)}>
            取消
          </button>
          <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-surface">
            创建
          </button>
        </div>
      </form>
    </div>
  );
}

const field = "mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-fg outline-none focus:border-primary";
