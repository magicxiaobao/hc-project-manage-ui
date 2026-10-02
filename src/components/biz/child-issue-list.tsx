import { useItemNavigationState } from "@/components/pm/use-go-item";
import { Link } from "@tanstack/react-router";
import type { WorkItem } from "@/lib/pm/domain";
import { StatusChip } from "@/components/biz/status-chip";

export function ChildIssueList({ projectKey, items }: { projectKey: string; items: WorkItem[] }) {
  const itemNavigationState = useItemNavigationState();
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="type-label">子事项</div>
      <ul className="mt-2 divide-y divide-border rounded-sm border border-border bg-surface">
        {items.map((child) => (
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
        ))}
      </ul>
    </div>
  );
}
