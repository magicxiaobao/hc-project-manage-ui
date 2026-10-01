import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Project, WorkItem } from "@/lib/pm/domain";
import { kindLabel } from "@/lib/pm/domain";
import { EmptyHint } from "@/components/biz/empty-hint";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";

export function SearchDialog({
  items,
  projects,
  onClose,
  onOpen,
}: {
  items: WorkItem[];
  projects: Project[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = text ? items.filter((item) => `${item.key} ${item.title}`.toLowerCase().includes(text)) : items.slice(0, 8);
    return list.slice(0, 8);
  }, [items, query]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-scrim/50 p-4 pt-[10vh]" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="搜索事项"
        className="w-full max-w-[600px] overflow-hidden rounded-sm bg-surface shadow-pop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索事项"
            className="type-body h-12 w-full border-0 bg-transparent outline-none placeholder:text-faint"
          />
          <button type="button" aria-label="关闭搜索" className="rounded-sm p-1 text-muted hover:bg-line" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        {results.length === 0 ? <EmptyHint>没有匹配的事项</EmptyHint> : null}
        <ul>
          {results.map((item) => {
            const project = projects.find((entry) => entry.id === item.projectId);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-line"
                  onClick={() => {
                    onClose();
                    if (project) onOpen(item.id);
                  }}
                >
                  <IssueTypeIcon item={item} />
                  <span className="type-link w-16 shrink-0">{item.key}</span>
                  <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="type-caption hidden sm:inline">{kindLabel(item)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
