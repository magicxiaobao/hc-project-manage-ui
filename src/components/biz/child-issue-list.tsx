import { useState } from "react";
import { useItemNavigationState } from "@/components/pm/use-go-item";
import { Link } from "@tanstack/react-router";
import type { WorkItem } from "@/lib/pm/domain";
import { columnOf } from "@/lib/pm/domain";
import { StatusChip } from "@/components/biz/status-chip";
import { usePm, BACKEND_READONLY_MESSAGE } from "@/lib/pm/store";
import { toast } from "sonner";

export function ChildIssueList({ projectKey, items, parent }: { projectKey: string; items: WorkItem[]; parent?: WorkItem }) {
  const itemNavigationState = useItemNavigationState();
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const currentUserId = usePm((state) => state.currentUserId);
  const [title, setTitle] = useState("");
  const [showDone, setShowDone] = useState(false);
  const done = items.filter((item) => columnOf(item.kind, item.status) === "done");
  const open = items.filter((item) => columnOf(item.kind, item.status) !== "done");
  const width = items.length ? (done.length / items.length) * 100 : 0;
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <div className="type-label">子事项</div>
        <span className="type-caption">
          {done.length}/{items.length}
        </span>
        <span className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-sm bg-line">
          <span className="block h-full bg-primary" style={{ width: `${width}%` }} />
        </span>
      </div>
      {open.length > 0 ? <ul className="mt-2 divide-y divide-border rounded-sm border border-border bg-surface">{open.map((child) => row(child))}</ul> : null}
      {done.length > 0 ? (
        <button type="button" className="type-caption mt-2" onClick={() => setShowDone((value) => !value)}>
          {showDone ? "收起" : "展开"}已完成 {done.length}
        </button>
      ) : null}
      {showDone ? <ul className="mt-2 divide-y divide-border rounded-sm border border-border bg-surface">{done.map((child) => row(child))}</ul> : null}
      {parent && project ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = title.trim();
            if (!next) return;
            const id = usePm.getState().createItem({
              projectId: project.id,
              kind: "task",
              title: next,
              description: "",
              priority: parent.priority,
              assigneeId: currentUserId,
              sprintId: parent.sprintId,
              parentId: parent.id,
            });
            // 后端模式只读拒绝时保留用户草稿并提示，不清空输入框
            if (!id) {
              toast(BACKEND_READONLY_MESSAGE);
              return;
            }
            setTitle("");
          }}
        >
          <input aria-label="新的子事项" value={title} placeholder="添加子事项" className="type-body h-9 min-w-0 flex-1 rounded-sm border border-border px-2" onChange={(event) => setTitle(event.target.value)} />
          <button type="submit" className="type-link">添加</button>
        </form>
      ) : null}
    </div>
  );

  function row(child: WorkItem) {
    return (
      <li key={child.id}>
        <Link
          state={itemNavigationState}
          to="/p/$projectKey/items/$itemKey"
          params={{ projectKey, itemKey: child.key }}
          className="type-body flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-line"
        >
          <span className="type-link w-16 shrink-0">{child.key}</span>
          <span className="min-w-0 flex-1 truncate">{child.title}</span>
          <StatusChip kind={child.kind} status={child.status} />
        </Link>
      </li>
    );
  }
}
