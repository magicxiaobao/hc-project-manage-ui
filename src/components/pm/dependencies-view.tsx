import { useMemo, useState } from "react";
import { Button, Label, NumberField, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { EmptyHint, IssueTypeIcon, LabeledField, OptionSelect, PageHeading, StateAction, StateChip, StatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import {
  DEPENDENCY_STATUS_LABEL,
  DEPENDENCY_TYPE_LABEL,
  formatDay,
  scheduleConflicts,
  type DependencyType,
  type WorkItem,
} from "@/lib/pm/domain";
import { cn } from "@/lib/utils";
import { usePm } from "@/lib/pm/store";

const TYPE_OPTIONS = (Object.keys(DEPENDENCY_TYPE_LABEL) as DependencyType[]).map((id) => ({
  id,
  label: DEPENDENCY_TYPE_LABEL[id],
  hint: id === "FS" ? "会挡住后置开始" : "只记录，不拦截",
}));

export function DependenciesView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const dependencies = usePm((state) => state.dependencies);
  const sprints = usePm((state) => state.sprints);
  const goToItem = useGoToItem();
  const [predecessorId, setPredecessorId] = useState("");
  const [successorId, setSuccessorId] = useState("");
  const [dependencyType, setDependencyType] = useState<DependencyType>("FS");
  const [lagDays, setLagDays] = useState(0);
  const [memo, setMemo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);

  const tasks = useMemo(() => items.filter((item) => item.projectId === project?.id && item.kind === "task"), [items, project?.id]);
  const taskOptions = tasks.map((task) => ({ id: task.id, label: task.key, hint: task.title, icon: <IssueTypeIcon item={task} /> }));
  const projectDeps = dependencies.filter((entry) => entry.projectId === project?.id);
  const visible = projectDeps.filter((entry) => (activeOnly ? entry.status === "ACTIVE" : true) && (typeFilter ? entry.dependencyType === typeFilter : true));
  const conflicts = scheduleConflicts(projectDeps, items, sprints);
  const activeCount = projectDeps.filter((entry) => entry.status === "ACTIVE").length;

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="依赖" hint="只加在任务上。有效的完成-开始会挡住后置任务的开始和继续；前置已完成或已取消则放行。作废后不再拦截，也不再计入环和时间冲突。" />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="有效" value={activeCount} />
        <Stat label="已作废" value={projectDeps.length - activeCount} />
        <Stat label="时间冲突" value={conflicts.length} />
      </div>
      <DependencyCanvas tasks={tasks} dependencies={projectDeps} onOpen={goToItem} />
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = usePm.getState().addDependency({
            projectId: project.id,
            predecessorId,
            successorId,
            dependencyType,
            lagDays,
            memo,
          });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setError("");
          setMemo("");
          setPredecessorId("");
          setSuccessorId("");
          setLagDays(0);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledField label="前置任务">
            <OptionSelect label="前置任务" value={predecessorId} options={taskOptions} onChange={setPredecessorId} />
          </LabeledField>
          <LabeledField label="后置任务">
            <OptionSelect label="后置任务" value={successorId} options={taskOptions} onChange={setSuccessorId} />
          </LabeledField>
          <LabeledField label="类型">
            <OptionSelect label="依赖类型" value={dependencyType} options={TYPE_OPTIONS} onChange={(id) => setDependencyType(id as DependencyType)} />
          </LabeledField>
          <NumberField aria-label="延迟天数" minValue={0} maxValue={60} value={lagDays} onChange={(value) => setLagDays(Number.isFinite(value) ? value : 0)}>
            <Label>延迟天数</Label>
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
        </div>
        <TextField value={memo} onChange={setMemo}>
          <Label>说明</Label>
          <TextArea placeholder="这条依赖为什么存在" />
        </TextField>
        {error ? <p className="type-body text-danger">{error}</p> : null}
        <div>
          <Button type="submit" variant="primary">
            添加依赖
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <OptionSelect label="筛选类型" value={typeFilter} options={[{ id: "", label: "全部类型" }, ...TYPE_OPTIONS]} onChange={setTypeFilter} />
        </div>
        <button
          type="button"
          className={cn("h-10 rounded-sm px-3", activeOnly ? "type-emphasis bg-line text-primary" : "type-body")}
          aria-pressed={activeOnly}
          onClick={() => setActiveOnly((value) => !value)}
        >
          只看有效
        </button>
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {visible.length === 0 ? <EmptyHint>没有符合条件的依赖。</EmptyHint> : null}
        {visible.map((entry) => {
          const predecessor = items.find((item) => item.id === entry.predecessorId);
          const successor = items.find((item) => item.id === entry.successorId);
          return (
            <div key={entry.id} className={cn("flex flex-col gap-2 border-b border-border px-3 py-3 last:border-b-0 md:flex-row md:flex-wrap md:items-center", focusId === entry.id && "bg-line")}>
              <TaskEnd item={predecessor} onOpen={goToItem} />
              <span className="type-caption shrink-0">
                {DEPENDENCY_TYPE_LABEL[entry.dependencyType]}
                {entry.lagDays > 0 ? ` · 延迟 ${entry.lagDays} 天` : ""}
              </span>
              <TaskEnd item={successor} onOpen={goToItem} />
              <span className="md:ml-auto flex shrink-0 items-center gap-2">
                <StateChip tone={entry.status === "ACTIVE" ? "progress" : "neutral"}>{DEPENDENCY_STATUS_LABEL[entry.status]}</StateChip>
                <StateAction tone="neutral" onPress={() => setFocusId((current) => (current === entry.id ? null : entry.id))}>
                  影响
                </StateAction>
                <StateAction
                  tone={entry.status === "ACTIVE" ? "danger" : "progress"}
                  onPress={() => {
                    const result = usePm.getState().setDependencyStatus(entry.id, entry.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
                    if (!result.ok) toast(result.message);
                  }}
                >
                  {entry.status === "ACTIVE" ? "作废" : "启用"}
                </StateAction>
              </span>
              {entry.memo ? <p className="type-caption w-full">{entry.memo}</p> : null}
            </div>
          );
        })}
      </div>
      {focusId ? <Impact projectDeps={projectDeps} items={items} focusId={focusId} onOpen={goToItem} /> : null}
      <section className="flex flex-col gap-2">
        <h2 className="type-section">时间冲突</h2>
        {conflicts.length === 0 ? <p className="type-caption">有效依赖和当前排期没有冲突。</p> : null}
        {conflicts.map((conflict) => (
          <p key={conflict.dependency.id} className="type-body">
            {conflict.predecessor.key} 的{conflict.from === "end" ? "结束" : "开始"}
            {conflict.dependency.lagDays > 0 ? `再延后 ${conflict.dependency.lagDays} 天` : ""}要到 {formatDay(conflict.ready)}，晚于 {conflict.successor.key} 的{conflict.to === "end" ? "结束" : "开始"} {formatDay(conflict.actual)}。
          </p>
        ))}
      </section>
    </div>
  );
}

function DependencyCanvas({
  tasks,
  dependencies,
  onOpen,
}: {
  tasks: WorkItem[];
  dependencies: { predecessorId: string; successorId: string; status: string; dependencyType: string }[];
  onOpen: (id: string) => void;
}) {
  const active = dependencies.filter((entry) => entry.status === "ACTIVE");
  const ids = [...new Set(active.flatMap((entry) => [entry.predecessorId, entry.successorId]))];
  if (ids.length === 0) return null;
  const level = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass += 1) {
    for (const entry of active) {
      const next = Math.min(ids.length, (level.get(entry.predecessorId) ?? 0) + 1);
      if (next > (level.get(entry.successorId) ?? 0)) level.set(entry.successorId, next);
    }
  }
  const columns = new Map<number, string[]>();
  for (const id of ids) {
    const column = level.get(id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), id]);
  }
  const ordered = [...columns.entries()].sort((a, b) => a[0] - b[0]);
  const place = new Map<string, { x: number; y: number }>();
  let height = 0;
  for (const [column, members] of ordered) {
    members.sort((a, b) => (tasks.find((task) => task.id === a)?.key ?? a).localeCompare(tasks.find((task) => task.id === b)?.key ?? b));
    members.forEach((id, index) => place.set(id, { x: column * 176, y: index * 56 }));
    height = Math.max(height, members.length * 56);
  }
  const width = ordered.length * 176;
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="type-section">依赖图</h2>
      <p className="type-meta mt-1">从左到右是前置到后置。只画有效依赖。</p>
      <div className="mt-3 overflow-x-auto">
        <div className="relative" style={{ width, height: Math.max(height, 56) }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={Math.max(height, 56)}>
            {active.map((entry) => {
              const from = place.get(entry.predecessorId);
              const to = place.get(entry.successorId);
              if (!from || !to) return null;
              return (
                <path
                  key={`${entry.predecessorId}-${entry.successorId}-${entry.dependencyType}`}
                  d={`M ${from.x + 148} ${from.y + 18} C ${from.x + 168} ${from.y + 18}, ${to.x - 16} ${to.y + 18}, ${to.x} ${to.y + 18}`}
                  fill="none"
                  stroke={entry.dependencyType === "FS" ? "#0052cc" : "#44546f"}
                  strokeWidth="1.5"
                  strokeDasharray={entry.dependencyType === "FS" ? undefined : "4 3"}
                />
              );
            })}
          </svg>
          {ids.map((id) => {
            const task = tasks.find((entry) => entry.id === id);
            const point = place.get(id);
            if (!task || !point) return null;
            return (
              <button
                key={id}
                type="button"
                className="absolute flex h-9 w-36 items-center gap-1 rounded-sm border border-border bg-bg px-2 text-left hover:bg-line"
                style={{ left: point.x, top: point.y }}
                onClick={() => onOpen(id)}
              >
                <span className="type-link shrink-0">{task.key}</span>
                <span className="type-caption min-w-0 truncate">{task.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Impact({
  projectDeps,
  items,
  focusId,
  onOpen,
}: {
  projectDeps: { id: string; predecessorId: string; successorId: string; status: string }[];
  items: WorkItem[];
  focusId: string;
  onOpen: (id: string) => void;
}) {
  const focus = projectDeps.find((entry) => entry.id === focusId);
  if (!focus) return null;
  const seen = new Set<string>();
  const queue = [focus.successorId];
  const later: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    later.push(id);
    for (const entry of projectDeps) {
      if (entry.status === "ACTIVE" && entry.predecessorId === id) queue.push(entry.successorId);
    }
  }
  const predecessor = items.find((item) => item.id === focus.predecessorId);
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <h2 className="type-section">从 {predecessor?.key ?? "前置"} 往后</h2>
      <p className="type-meta mt-1">只沿有效依赖走。作废的线不算。</p>
      <div className="mt-3 flex flex-col gap-2">
        {later.map((id) => {
          const item = items.find((entry) => entry.id === id);
          if (!item) return null;
          return (
            <button key={id} type="button" className="flex items-center gap-2 text-left" onClick={() => onOpen(id)}>
              <IssueTypeIcon item={item} />
              <span className="type-link">{item.key}</span>
              <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-4 py-3">
      <div className="type-caption">{label}</div>
      <div className="type-section mt-1">{value}</div>
    </div>
  );
}

function TaskEnd({ item, onOpen }: { item: WorkItem | undefined; onOpen: (id: string) => void }) {
  if (!item) return <span className="type-caption">任务已不在</span>;
  return (
    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpen(item.id)}>
      <IssueTypeIcon item={{ kind: "task", requirementType: null, taskType: "开发任务" }} />
      <span className="type-link shrink-0">{item.key}</span>
      <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
      <StatusChip kind="task" status={item.status} />
    </button>
  );
}
