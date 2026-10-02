import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyHint, IssueTypeIcon, PageHeading, PersonAvatar, PriorityMark, StatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import type { Person, WorkItem } from "@/lib/pm/domain";
import { cn } from "@/lib/utils";
import { usePm } from "@/lib/pm/store";

const DONE = new Set(["COMPLETED", "CLOSED", "RESOLVED", "VERIFIED"]);

export function RequirementsView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allItems = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === project?.id), [allItems, project?.id]);
  const goToItem = useGoToItem();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const requirements = items.filter((item) => item.kind === "requirement");
  const roots = requirements.filter((item) => !item.parentId || !requirements.some((parent) => parent.id === item.parentId));
  const childrenOf = (id: string) => items.filter((item) => item.parentId === id && item.kind !== "defect");
  const branchIds = items.filter((item) => childrenOf(item.id).length > 0).map((item) => item.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="需求" hint="史诗下面挂故事，故事下面挂任务。点标题打开事项，箭头展开或收起。" />
        <div className="flex gap-2">
          <button type="button" className="type-emphasis rounded-sm border border-border px-3 py-1.5" onClick={() => setCollapsed(new Set())}>
            展开全部
          </button>
          <button type="button" className="type-emphasis rounded-sm border border-border px-3 py-1.5" onClick={() => setCollapsed(new Set(branchIds))}>
            收起全部
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="史诗" value={requirements.filter((item) => item.requirementType === "Epic").length} />
        <Stat label="故事" value={requirements.filter((item) => item.requirementType === "Story").length} />
        <Stat label="开发中" value={requirements.filter((item) => item.status === "IN_DEVELOPMENT").length} />
        <Stat label="已完成" value={requirements.filter((item) => item.status === "COMPLETED").length} />
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {roots.length === 0 ? <EmptyHint>这个项目还没有需求。</EmptyHint> : null}
        {roots.map((root) => (
          <RequirementNode
            key={root.id}
            item={root}
            people={people}
            depth={0}
            collapsed={collapsed}
            childrenOf={childrenOf}
            onOpen={goToItem}
            onToggle={(id) =>
              setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
        ))}
      </div>
    </div>
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

function descendants(id: string, childrenOf: (id: string) => WorkItem[]): WorkItem[] {
  return childrenOf(id).flatMap((child) => [child, ...descendants(child.id, childrenOf)]);
}

function RequirementNode({
  item,
  people,
  depth,
  collapsed,
  childrenOf,
  onOpen,
  onToggle,
}: {
  item: WorkItem;
  people: Person[];
  depth: number;
  collapsed: Set<string>;
  childrenOf: (id: string) => WorkItem[];
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const children = childrenOf(item.id);
  const hidden = collapsed.has(item.id);
  const assignee = people.find((person) => person.id === item.assigneeId);
  const below = descendants(item.id, childrenOf);
  const done = below.filter((child) => DONE.has(child.status)).length;
  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border pr-3 hover:bg-line" style={{ paddingLeft: 8 + depth * 16 }}>
        {children.length > 0 ? <button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary" aria-label={`${hidden ? "展开" : "收起"} ${item.key} ${item.title}`} aria-expanded={!hidden} aria-controls={`requirement-children-${item.id}`} onClick={() => onToggle(item.id)}>
          <ChevronRight aria-hidden="true" className={cn("size-4 text-muted", !hidden && "rotate-90")} />
        </button> : <span aria-hidden="true" className="size-8 shrink-0" />}
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" onClick={() => onOpen(item.id)}>
          <IssueTypeIcon item={item} />
          <span className="type-link w-16 shrink-0">{item.key}</span>
          <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
          <span className="hidden shrink-0 sm:inline-flex">
            <PriorityMark priority={item.priority} />
          </span>
          {item.storyPoints != null ? <span className="type-caption hidden shrink-0 sm:inline">{item.storyPoints} 点</span> : null}
          {below.length > 0 ? <span className="type-caption hidden shrink-0 sm:inline">{done}/{below.length}</span> : null}
          <StatusChip kind={item.kind} status={item.status} />
          <span className="hidden shrink-0 sm:inline-flex">
            <PersonAvatar person={assignee} />
          </span>
        </button>
      </div>
      {children.length > 0 ? <div id={`requirement-children-${item.id}`} hidden={hidden}>
        {children.map((child) => (
          <RequirementNode key={child.id} item={child} people={people} depth={depth + 1} collapsed={collapsed} childrenOf={childrenOf} onOpen={onOpen} onToggle={onToggle} />
        ))}
      </div> : null}
    </div>
  );
}
