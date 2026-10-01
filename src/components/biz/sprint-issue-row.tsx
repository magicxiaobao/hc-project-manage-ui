import type { Person, Sprint, WorkItem } from "@/lib/pm/domain";
import { SprintSelect } from "@/components/biz/field-selects";
import { IssueRow } from "@/components/biz/issue-row";

export function SprintIssueRow({
  item,
  assignee,
  sprints,
  onOpen,
  onSprint,
}: {
  item: WorkItem;
  assignee?: Person | null;
  sprints: Sprint[];
  onOpen: (id: string) => void;
  onSprint: (sprintId: string | null) => void;
}) {
  return (
    <IssueRow
      item={item}
      assignee={assignee}
      draggable
      onOpen={onOpen}
      extra={
        <div className="hidden w-40 md:block">
          <SprintSelect
            label={`${item.key} 的迭代`}
            sprints={sprints}
            value={item.sprintId ?? ""}
            showState={false}
            onChange={(sprintId) => onSprint(sprintId || null)}
          />
        </div>
      }
    />
  );
}
