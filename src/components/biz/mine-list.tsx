import type { Person, Project, WorkItem } from "@/lib/pm/domain";
import { EmptyHint } from "@/components/biz/empty-hint";
import { IssueRow } from "@/components/biz/issue-row";

export function MineList({
  items,
  projects,
  people,
  onOpen,
}: {
  items: WorkItem[];
  projects: Project[];
  people: Person[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="type-section">我负责的</h2>
        <span className="type-caption">{items.length} 项未完成</span>
      </header>
      <ul>
        {items.length === 0 ? <EmptyHint>没有指派给你的未完成事项</EmptyHint> : null}
        {items.map((item) => {
          const project = projects.find((entry) => entry.id === item.projectId);
          return (
            <IssueRow
              key={item.id}
              item={item}
              assignee={people.find((person) => person.id === item.assigneeId)}
              onOpen={onOpen}
              extra={<span className="type-caption flex flex-wrap gap-x-2"><span>{item.dueDate ? `截止 ${item.dueDate.slice(5, 10)}` : "未设截止"}</span><span className="hidden max-w-24 truncate md:inline">{project?.name}</span></span>}
            />
          );
        })}
      </ul>
    </section>
  );
}
