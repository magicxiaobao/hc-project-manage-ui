import { Link, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, MetaLine, PriorityMark, StatusPill, TypeIcon, severityLabel } from "@/components/pm/bits";
import { formatRelative, kindLabel, needsReason, nextStatuses, priorityLabel, statusLabel, transitionName } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { cn } from "@/lib/utils";

type Tab = "comment" | "feed" | "history";
type WorkPriority = "HIGH" | "MEDIUM" | "LOW";

export function IssuePage({ projectKey, itemKey }: { projectKey: string; itemKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const item = usePm((state) => state.items.find((entry) => entry.projectId === project?.id && entry.key === itemKey));
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const versions = usePm((state) => state.versions);
  const items = usePm((state) => state.items);
  const commentsAll = usePm((state) => state.comments);
  const feedsAll = usePm((state) => state.feeds);
  const historiesAll = usePm((state) => state.histories);
  const comments = useMemo(() => commentsAll.filter((entry) => entry.itemId === item?.id), [commentsAll, item?.id]);
  const feeds = useMemo(() => feedsAll.filter((entry) => entry.itemId === item?.id), [feedsAll, item?.id]);
  const histories = useMemo(() => historiesAll.filter((entry) => entry.itemId === item?.id), [historiesAll, item?.id]);
  const [tab, setTab] = useState<Tab>("comment");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setTab("comment");
    setDraft("");
    setPending(null);
    setReason("");
  }, [itemKey]);

  if (!project || !item) {
    return <div className="p-8 text-sm text-muted">没有找到这个事项。</div>;
  }

  const parent = items.find((entry) => entry.id === item.parentId);
  const children = items.filter((entry) => entry.parentId === item.id);
  const projectSprints = sprints.filter((entry) => entry.projectId === item.projectId);
  const projectVersions = versions.filter((entry) => entry.projectId === item.projectId);
  const transitions = nextStatuses(item);
  const navigate = useNavigate();
  const close = () => {
    void navigate({ to: "/p/$projectKey", params: { projectKey } });
  };

  const apply = (to: string, given?: string) => {
    const result = usePm.getState().transition(item.id, to, given);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    setPending(null);
    setReason("");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-[#091e42]/54 p-3 md:p-8" role="presentation" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.key}
        className="flex max-h-full w-full max-w-[1040px] flex-col overflow-hidden rounded-[3px] bg-surface shadow-[0_8px_16px_rgba(9,30,66,0.25)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <TypeIcon item={item} />
          <span className="text-xs tracking-wide text-muted uppercase">{kindLabel(item)}</span>
          <span className="text-sm text-muted">{item.key}</span>
          <StatusPill kind={item.kind} status={item.status} />
          <button type="button" className="ml-auto rounded-[3px] p-1.5 text-muted hover:bg-line" aria-label="关闭" onClick={close}>
            <X className="size-4" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-5 py-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        {parent ? (
          <Link
            to="/p/$projectKey/items/$itemKey"
            params={{ projectKey, itemKey: parent.key }}
            className="mt-3 inline-block text-xs text-primary-ink hover:underline"
          >
            {parent.key} {parent.title}
          </Link>
        ) : null}
        <input
          value={item.title}
          aria-label="标题"
          onChange={(event) => usePm.getState().updateItem(item.id, { title: event.target.value })}
          className="mt-2 w-full border-0 bg-transparent text-2xl font-medium outline-none"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {transitions.length === 0 ? <span className="text-xs text-faint">没有可继续的流转</span> : null}
          {transitions.map((to) => (
            <button
              key={to}
              type="button"
              className={cn(
                "h-8 rounded-md border px-2 text-xs font-medium",
                pending === to ? "border-primary bg-primary-soft text-primary-ink" : "border-border bg-surface hover:bg-line",
              )}
              onClick={() => {
                if (needsReason(to)) {
                  setPending(to);
                  return;
                }
                apply(to);
              }}
            >
              {transitionName(item.kind, item.status, to)}
            </button>
          ))}
        </div>
        {pending ? (
          <form
            className="mt-3 flex flex-col gap-2 rounded-md bg-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              apply(pending, reason);
            }}
          >
            <label className="text-xs text-muted" htmlFor="reason">
              {transitionName(item.kind, item.status, pending)}需要原因
            </label>
            <input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
              placeholder="写给生命周期历史"
            />
            <div className="flex gap-2">
              <button type="submit" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-surface">
                确认流转
              </button>
              <button type="button" className="h-8 rounded-md px-3 text-xs text-muted hover:bg-surface" onClick={() => setPending(null)}>
                取消
              </button>
            </div>
          </form>
        ) : null}

        <label className="mt-5 block text-xs font-medium text-faint">描述</label>
        <textarea
          value={item.description}
          aria-label="描述"
          onChange={(event) => usePm.getState().updateItem(item.id, { description: event.target.value })}
          rows={5}
          className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
        />

        {item.kind === "defect" ? (
          <p className="mt-3 text-sm text-muted">
            {item.defectType}
            {item.severity ? ` · ${severityLabel(item.severity)}` : ""}
          </p>
        ) : null}
      </div>

      <aside className="flex h-fit flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Field label="负责人">
          <select
            value={item.assigneeId ?? ""}
            onChange={(event) => usePm.getState().updateItem(item.id, { assigneeId: event.target.value || null })}
            className={selectClass}
          >
            <option value="">未分配</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.role}
              </option>
            ))}
          </select>
        </Field>
        <Field label="优先级">
          <select
            value={item.priority}
            onChange={(event) => usePm.getState().updateItem(item.id, { priority: event.target.value as WorkPriority })}
            className={selectClass}
          >
            <option value="HIGH">高</option>
            <option value="MEDIUM">中</option>
            <option value="LOW">低</option>
          </select>
        </Field>
        <Field label="迭代">
          <select
            value={item.sprintId ?? ""}
            onChange={(event) => usePm.getState().updateItem(item.id, { sprintId: event.target.value || null })}
            className={selectClass}
          >
            <option value="">未排期</option>
            {projectSprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
                {sprint.state === "active" ? " · 进行中" : sprint.state === "closed" ? " · 已完成" : " · 规划中"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="版本">
          <select
            value={item.versionId ?? ""}
            onChange={(event) => usePm.getState().updateItem(item.id, { versionId: event.target.value || null })}
            className={selectClass}
          >
            <option value="">未纳入版本</option>
            {projectVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.versionNumber} {version.name}
              </option>
            ))}
          </select>
        </Field>
        {item.kind !== "defect" ? (
          <Field label="故事点">
            <input
              type="number"
              min={0}
              value={item.storyPoints ?? 0}
              onChange={(event) => usePm.getState().updateItem(item.id, { storyPoints: Number(event.target.value) })}
              className={selectClass}
            />
          </Field>
        ) : (
          <Field label="严重程度">
            <div className="flex h-9 items-center text-sm">{severityLabel(item.severity ?? "")}</div>
          </Field>
        )}
        {item.kind === "task" ? (
          <Field label={`进度 ${item.progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={item.progress}
              onChange={(event) => usePm.getState().updateItem(item.id, { progress: Number(event.target.value) })}
              className="w-full accent-primary"
            />
          </Field>
        ) : null}
        <div className="flex items-center gap-2 text-xs text-faint">
          <PriorityMark priority={item.priority} />
          <span>{priorityLabel(item.priority)}优先级</span>
        </div>
        <p className="text-xs text-faint">报告人 {people.find((person) => person.id === item.reporterId)?.name}</p>
      </aside>

      <div className="lg:col-start-1 lg:row-start-2">
        {children.length > 0 ? (
          <div className="mt-5">
            <div className="text-xs font-medium text-faint">子事项</div>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
              {children.map((child) => (
                <li key={child.id}>
                  <Link
                    to="/p/$projectKey/items/$itemKey"
                    params={{ projectKey, itemKey: child.key }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-line"
                  >
                    <span className="w-16 shrink-0 text-primary-ink">{child.key}</span>
                    <span className="min-w-0 flex-1 truncate">{child.title}</span>
                    <StatusPill kind={child.kind} status={child.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex gap-1 border-b border-border">
          <TabButton current={tab} id="comment" onSelect={setTab} label={`评论 ${comments.length}`} />
          <TabButton current={tab} id="feed" onSelect={setTab} label="对象动态" />
          <TabButton current={tab} id="history" onSelect={setTab} label="生命周期历史" />
        </div>

        {tab === "comment" ? (
          <div className="mt-3">
            <ul className="flex flex-col gap-3">
              {comments.length === 0 ? <li className="text-sm text-faint">还没有评论。评论只留在讨论里，不会写进对象动态。</li> : null}
              {comments.map((comment) => {
                const author = people.find((person) => person.id === comment.authorId);
                return (
                  <li key={comment.id} className="flex gap-2">
                    <Avatar person={author} />
                    <div className="min-w-0">
                      <div className="text-xs text-muted">
                        <span className="font-medium text-fg">{author?.name}</span>
                        <span className="ml-2 text-faint">{formatRelative(comment.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed">{comment.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <form
              className="mt-4 flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                usePm.getState().addComment(item.id, draft);
                setDraft("");
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="写下评论，不会记入对象动态"
                className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button type="submit" disabled={!draft.trim()} className="h-9 self-end rounded-md bg-primary px-3 text-sm font-medium text-surface disabled:opacity-40">
                发送评论
              </button>
            </form>
          </div>
        ) : null}

        {tab === "feed" ? (
          <ul className="mt-3 flex flex-col gap-3">
            {feeds.length === 0 ? <li className="text-sm text-faint">还没有对象动态。</li> : null}
            {feeds.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="font-medium">{people.find((person) => person.id === entry.actorId)?.name}</span>
                <span className="text-muted"> {entry.text}</span>
                <div className="text-xs text-faint">{formatRelative(entry.createdAt)}</div>
              </li>
            ))}
          </ul>
        ) : null}

        {tab === "history" ? (
          <ul className="mt-3 flex flex-col gap-3">
            {histories.length === 0 ? <li className="text-sm text-faint">还没有成功的状态流转。</li> : null}
            {histories.map((entry) => (
              <li key={entry.id} className="rounded-md bg-line px-3 py-2 text-sm">
                <div>
                  {people.find((person) => person.id === entry.actorId)?.name} · {entry.transitionName}
                </div>
                <div className="text-xs text-muted">
                  {statusLabel(item.kind, entry.fromStatus)} → {statusLabel(item.kind, entry.toStatus)}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </div>
                <div className="text-xs text-faint">{formatRelative(entry.createdAt)}</div>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-6 text-xs text-faint">
          <MetaLine item={item} /> · 更新于 {formatRelative(item.updatedAt)}
        </p>
      </div>
        </div>
      </div>
    </div>
  );
}

const selectClass = "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-faint">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TabButton({ current, id, label, onSelect }: { current: Tab; id: Tab; label: string; onSelect: (tab: Tab) => void }) {
  return (
    <button
      type="button"
      className={cn("h-9 px-2 text-sm", current === id ? "border-b-2 border-primary font-medium text-primary-ink" : "text-muted")}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}
