import type { Person, Sprint, WorkItem } from "@/lib/pm/domain";
import { SprintSelect } from "@/components/biz/field-selects";
import { IssueRow } from "@/components/biz/issue-row";

export function SprintIssueRow({
  item,
  assignee,
  sprints,
  onOpen,
  onSprint,
  onDropBefore,
}: {
  item: WorkItem;
  assignee?: Person | null;
  sprints: Sprint[];
  onOpen: (id: string) => void;
  onSprint: (sprintId: string | null) => void;
  onDropBefore?: (id: string) => void;
}) {
  return (
    <IssueRow
      item={item}
      assignee={assignee}
      draggable
      onOpen={onOpen}
      onDropBefore={onDropBefore}
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
