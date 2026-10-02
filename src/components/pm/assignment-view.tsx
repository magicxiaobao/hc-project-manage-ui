import { useMemo, useState } from "react";
import { EmptyHint, IssueTypeIcon, OptionSelect, PageHeading, StatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { columnOf, formatRelative, workLogStatus, type WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

function isOpen(item: WorkItem) {
  const column = columnOf(item.kind, item.status);
  return column !== "done" && column !== "cancelled";
}

export function AssignmentView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const logs = usePm((state) => state.workLogs);
  const histories = usePm((state) => state.histories);
  const goToItem = useGoToItem();
  const [openId, setOpenId] = useState<string | null>(null);
  const tasks = useMemo(
    () => items.filter((item) => item.projectId === project?.id && item.kind === "task" && isOpen(item)).sort((a, b) => a.key.localeCompare(b.key)),
    [items, project?.id],
  );
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const members = people.filter((person) => project.memberIds.includes(person.id));
  const groups = [
    ...members.map((person) => ({ id: person.id, name: person.name, tasks: tasks.filter((item) => item.assigneeId === person.id) })),
    { id: "", name: "未分配", tasks: tasks.filter((item) => !item.assigneeId) },
  ].filter((group) => group.tasks.length > 0 || group.id !== "");
  const options = [{ id: "", label: "未分配" }, ...members.map((person) => ({ id: person.id, label: person.name }))];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="任务分配" hint="只看未完成的任务。改负责人会记一笔对象动态。" />
      {tasks.length === 0 ? <EmptyHint>当前没有未完成任务。</EmptyHint> : null}
      {groups.filter((group) => group.tasks.length > 0).map((group) => {
        const points = group.tasks.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0);
        const estimated = group.tasks.reduce((sum, item) => sum + (item.estimatedHours ?? 0), 0);
        const hours = logs.filter((entry) => entry.userId === group.id && group.tasks.some((item) => item.id === entry.itemId)).reduce((sum, entry) => sum + entry.hours, 0);
        return (
          <section key={group.id || "none"} className="overflow-hidden rounded-sm border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <h2 className="type-section">{group.name}</h2>
              <span className="type-caption">
                {group.tasks.length} 项 · {points} 点 · 预估 {estimated} 小时 · 已记 {hours} 小时
              </span>
            </div>
            {group.tasks.length === 0 ? <p className="type-meta px-4 py-3">没有未完成任务。</p> : null}
            {group.tasks.map((item) => {
              const open = openId === item.id;
              const latest = histories.filter((entry) => entry.itemId === item.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              const spent = logs.filter((entry) => entry.itemId === item.id && workLogStatus(entry) !== "REJECTED");
              const actor = people.find((person) => person.id === latest?.actorId);
              return (
                <div key={item.id} className="border-b border-border last:border-b-0">
                  <div className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setOpenId(open ? null : item.id)}>
                      <IssueTypeIcon item={item} />
                      <span className="type-link shrink-0">{item.key}</span>
                      <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
                      <StatusChip kind={item.kind} status={item.status} />
                    </button>
                    <OptionSelect label="负责人" value={item.assigneeId ?? ""} options={options} onChange={(assigneeId) => usePm.getState().updateItem(item.id, { assigneeId: assigneeId || null })} />
                  </div>
                  {open ? (
                    <div className="flex flex-col gap-1 px-4 pb-3">
                      <p className="type-caption">{latest ? `最近流转：${latest.transitionName}${actor ? ` · ${actor.name}` : ""} · ${formatRelative(latest.createdAt)}` : "还没有流转记录。"}</p>
                      <p className="type-caption">
                        {spent.length > 0 ? `已记 ${trimHours(spent.reduce((sum, entry) => sum + entry.hours, 0))} 小时` : "这条任务还没有工时。"}
                        <button type="button" className="type-link ml-2" onClick={() => goToItem(item.id)}>打开</button>
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
      {groups.some((group) => group.tasks.length === 0) ? (
        <details className="rounded-sm border border-border bg-surface">
          <summary className="type-section cursor-pointer px-4 py-3 focus-visible:outline-2 focus-visible:outline-primary">暂无未完成任务的成员 · {groups.filter((group) => group.tasks.length === 0).length} 人</summary>
          <ul className="flex flex-col gap-2 px-4 pb-3">
            {groups.filter((group) => group.tasks.length === 0).map((group) => <li key={group.id} className="type-body">{group.name}<span className="type-caption ml-2">无未完成任务</span></li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function trimHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
