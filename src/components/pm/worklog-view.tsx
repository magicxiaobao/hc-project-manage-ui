import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DayField, EmptyHint, IssueTypeIcon, LabeledField, OptionSelect, PageHeading, PersonAvatar, StateAction, StateChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { formatDay, WORK_LOG_STATUS_LABEL, workLogStatus, type WorkLog, type WorkLogStatus } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

// Keep the source partition on item return, scoped to the project and current user.
const taskViews = new Map<string, "pending" | "mine" | "all">();

export function WorklogView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const logs = usePm((state) => state.workLogs);
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const currentUserId = usePm((state) => state.currentUserId);
  const rows = useMemo(
    () => logs.filter((entry) => entry.projectId === project?.id).sort((a, b) => b.workDate.localeCompare(a.workDate) || b.id.localeCompare(a.id)),
    [logs, project?.id],
  );
  const projectItems = useMemo(() => items.filter((entry) => entry.projectId === project?.id), [items, project?.id]);
  const goToItem = useGoToItem();
  const [itemId, setItemId] = useState("");
  const [hours, setHours] = useState("1");
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("1");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const viewKey = `${projectKey}:${currentUserId}`;
  const [choice, setChoice] = useState<{ key: string; view: "pending" | "mine" | "all" } | null>(null);
  const view = choice?.key === viewKey ? choice.view : taskViews.get(viewKey) ?? (project?.leadId === currentUserId ? "pending" : "mine");
  const setView = (next: "pending" | "mine" | "all") => { taskViews.set(viewKey, next); setChoice({ key: viewKey, view: next }); };
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const counted = rows.filter((entry) => workLogStatus(entry) !== "REJECTED");
  const total = counted.reduce((sum, entry) => sum + entry.hours, 0);
  const pending = rows.filter((entry) => workLogStatus(entry) === "PENDING");
  const approvedHours = rows.filter((entry) => workLogStatus(entry) === "APPROVED").reduce((sum, entry) => sum + entry.hours, 0);
  const byPerson = people
    .map((person) => ({ id: person.id, label: person.name, hours: counted.filter((entry) => entry.userId === person.id).reduce((sum, entry) => sum + entry.hours, 0) }))
    .filter((entry) => entry.hours > 0)
    .sort((a, b) => b.hours - a.hours);
  const byTask = projectItems
    .map((item) => ({ id: item.id, label: item.key, hours: counted.filter((entry) => entry.itemId === item.id).reduce((sum, entry) => sum + entry.hours, 0) }))
    .filter((entry) => entry.hours > 0)
    .sort((a, b) => b.hours - a.hours);
  const byDate = [...new Set(counted.map((entry) => entry.workDate))].sort((a, b) => b.localeCompare(a)).map((date) => ({
    id: date,
    label: formatDay(date),
    hours: counted.filter((entry) => entry.workDate === date).reduce((sum, entry) => sum + entry.hours, 0),
  }));
  const peak = Math.max(1, ...byPerson.map((entry) => entry.hours), ...byTask.map((entry) => entry.hours), ...byDate.map((entry) => entry.hours));
  const myRows = rows.filter((entry) => entry.userId === currentUserId);
  const visibleRows = view === "pending" ? pending : view === "mine" ? myRows : rows;
  const me = people.find((person) => person.id === currentUserId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="工时" hint={`有效 ${trimHours(total)} 小时，其中已通过 ${trimHours(approvedHours)}。驳回的不计入。`} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-caption">待审批 {pending.length} 条</span>
        <Button variant="outline" onPress={() => downloadWorklogs(rows, items, people, byPerson, byTask, byDate)}>
          导出
        </Button>
      </div>
      <div aria-label="工时任务" className="flex flex-wrap gap-2">
        {([{ id: "pending", label: "待审批", count: pending.length }, { id: "mine", label: "我的登记", count: myRows.length }, { id: "all", label: "全部记录", count: rows.length }] as const).map((entry) => <button key={entry.id} type="button" aria-pressed={view === entry.id} className={`type-body min-h-10 rounded-sm border border-border px-3 py-2 ${view === entry.id ? "bg-line text-primary" : ""}`} onClick={() => setView(entry.id)}>{entry.label} {entry.count}</button>)}
      </div>
      <h2 className="type-section">{view === "pending" ? "待审批" : view === "mine" ? "我的登记" : "全部记录"}</h2>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {visibleRows.length === 0 ? <EmptyHint>{view === "pending" ? "没有待审批工时。" : view === "mine" ? "你还没有登记工时。" : "还没有工时记录。"}</EmptyHint> : null}
        {visibleRows.map((entry) => {
          const item = items.find((candidate) => candidate.id === entry.itemId);
          const person = people.find((candidate) => candidate.id === entry.userId);
          return (
            <div key={entry.id} className="grid grid-cols-2 items-center gap-3 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[88px_72px_minmax(0,1fr)]">
              <span className="type-caption">{formatDay(entry.workDate)}</span>
              <span className="type-emphasis">{trimHours(entry.hours)}h</span>
              <span className="col-span-full flex min-w-0 flex-wrap items-center gap-2 sm:col-auto">
                <PersonAvatar person={person} />
                {item ? (
                  <button type="button" className="type-link shrink-0" onClick={() => goToItem(item.id)}>
                    {item.key}
                  </button>
                ) : null}
                <span className="type-body truncate">{entry.note}</span>
                <StateChip tone={toneOf(workLogStatus(entry))}>{WORK_LOG_STATUS_LABEL[workLogStatus(entry)]}</StateChip>
                {workLogStatus(entry) === "PENDING" ? (
                  <>
                    <StateAction tone="done" onPress={() => applyReview(entry.id, "APPROVED")}>
                      通过
                    </StateAction>
                    <StateAction tone="danger" onPress={() => applyReview(entry.id, "REJECTED")}>
                      驳回
                    </StateAction>
                    <StateAction
                      tone="neutral"
                      onPress={() => {
                        setEditingId(entry.id);
                        setEditHours(String(entry.hours));
                        setEditDate(entry.workDate);
                        setEditNote(entry.note);
                      }}
                    >
                      修改
                    </StateAction>
                  </>
                ) : null}
              </span>
              {editingId === entry.id ? (
                <form
                  className="col-span-full flex flex-col gap-2 sm:col-span-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const result = usePm.getState().updateWorkLog(entry.id, { hours: Number(editHours), workDate: editDate, note: editNote });
                    if (!result.ok) toast.error(result.message);
                    else setEditingId(null);
                  }}
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <DayField label="日期" value={editDate} onChange={setEditDate} />
                    <TextField value={editHours} onChange={setEditHours}>
                      <Label>小时</Label>
                      <Input type="number" min={0.5} max={24} step={0.5} />
                    </TextField>
                    <TextField value={editNote} onChange={setEditNote}>
                      <Label>说明</Label>
                      <Input />
                    </TextField>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary">保存</Button>
                    <Button type="button" variant="outline" onPress={() => setEditingId(null)}>取消</Button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">登记工时</summary>
<div className="flex flex-col gap-3 p-3">
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const amount = Number(hours);
          if (!itemId) {
            setError("先选择事项");
            return;
          }
          if (!Number.isFinite(amount) || amount <= 0 || amount > 24) {
            setError("工时要在 0 到 24 小时之间");
            return;
          }
          usePm.getState().addWorkLog({ projectId: project.id, itemId, hours: amount, workDate, note });
          setNote("");
          setHours("1");
          setError("");
        }}
      >
        <div className="type-section">登记工时{me ? ` · ${me.name}` : ""}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <LabeledField label="事项">
            <OptionSelect
              label="事项"
              value={itemId}
              options={projectItems.map((item) => ({ id: item.id, label: `${item.key} ${item.title}`, icon: <IssueTypeIcon item={item} /> }))}
              onChange={setItemId}
            />
          </LabeledField>
          <DayField label="日期" value={workDate} onChange={setWorkDate} />
          <TextField value={hours} onChange={setHours}>
            <Label>小时</Label>
            <Input type="number" min={0.5} max={24} step={0.5} />
          </TextField>
        </div>
        <TextField value={note} onChange={setNote}>
          <Label>说明</Label>
          <TextArea placeholder="做了什么" />
        </TextField>
        {error ? <p className="type-body text-danger">{error}</p> : null}
        <div>
          <Button type="submit" variant="primary">
            记一笔
          </Button>
        </div>
      <button type="button" className="type-body min-h-10 self-start rounded-sm border border-border px-3 py-2" onClick={(event) => { const panel = event.currentTarget.closest("details"); panel?.removeAttribute("open"); panel?.querySelector("summary")?.focus(); }}>收起（保留草稿）</button>
</form>

</div>
</details>
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">工时汇总与分析</summary>
<div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-sm border border-border bg-surface px-4 py-3">
          <div className="type-caption">合计</div>
          <div className="type-section mt-1">{trimHours(total)} 小时</div>
        </div>
        <div className="rounded-sm border border-border bg-surface px-4 py-3">
          <div className="type-caption">记录</div>
          <div className="type-section mt-1">{rows.length} 条</div>
        </div>
      </div>
      {byPerson.length > 0 ? <Summary title="按人" rows={byPerson} peak={peak} /> : null}
      {byTask.length > 0 ? <Summary title="按任务" rows={byTask} peak={peak} /> : null}
      {byDate.length > 0 ? <Summary title="按日期" rows={byDate} peak={peak} /> : null}

</div>
</details>
    </div>
  );
}

function trimHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function toneOf(status: WorkLogStatus) {
  if (status === "APPROVED") return "done" as const;
  if (status === "REJECTED") return "danger" as const;
  return "review" as const;
}

function applyReview(id: string, status: "APPROVED" | "REJECTED") {
  const result = usePm.getState().reviewWorkLog(id, status);
  if (!result.ok) toast.error(result.message);
}

function Summary({ title, rows, peak }: { title: string; rows: { id: string; label: string; hours: number }[]; peak: number }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-3 py-3">
      <div className="type-label mb-2">{title}</div>
      <div className="flex flex-col gap-2">
        {rows.map((entry) => (
          <div key={entry.id} className="grid grid-cols-[88px_minmax(0,1fr)_48px] items-center gap-2">
            <span className="type-caption truncate">{entry.label}</span>
            <span className="h-2 self-center overflow-hidden rounded-sm bg-line">
              <span className="block h-full rounded-sm bg-primary" style={{ width: `${(entry.hours / peak) * 100}%` }} />
            </span>
            <span className="type-caption text-right">{trimHours(entry.hours)}h</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function downloadWorklogs(
  rows: WorkLog[],
  items: { id: string; key: string }[],
  people: { id: string; name: string }[],
  byPerson: { label: string; hours: number }[],
  byTask: { label: string; hours: number }[],
  byDate: { label: string; hours: number }[],
) {
  const lines = ["日期,人员,事项,小时,说明,状态"];
  for (const entry of rows) {
    const person = people.find((candidate) => candidate.id === entry.userId)?.name ?? "";
    const key = items.find((candidate) => candidate.id === entry.itemId)?.key ?? "";
    lines.push([entry.workDate, person, key, String(entry.hours), entry.note, WORK_LOG_STATUS_LABEL[workLogStatus(entry)]].map(csv).join(","));
  }
  lines.push("");
  for (const entry of byPerson) lines.push(["汇总", "按人", entry.label, String(entry.hours)].map(csv).join(","));
  for (const entry of byTask) lines.push(["汇总", "按任务", entry.label, String(entry.hours)].map(csv).join(","));
  for (const entry of byDate) lines.push(["汇总", "按日期", entry.label, String(entry.hours)].map(csv).join(","));
  downloadCsv("工时.csv", lines.join("\n"));
}

function csv(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
