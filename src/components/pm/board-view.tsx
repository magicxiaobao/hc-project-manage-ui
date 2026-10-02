import { useEffect, useMemo, useState } from "react";
import { BoardFilterBar, EmptyHint, KanbanBoard, PageHeading } from "@/components/biz";
import type { ItemKind } from "@/lib/pm/domain";
import { byRank, columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { rememberBrowse, useGoToItem } from "@/components/pm/use-go-item";

export function BoardView({ projectKey, lockedKind }: { projectKey: string; lockedKind?: ItemKind }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allSprints = usePm((state) => state.sprints);
  const sprints = useMemo(() => allSprints.filter((entry) => entry.projectId === project?.id), [allSprints, project?.id]);
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const boards = usePm((state) => state.boards);
  const currentUserId = usePm((state) => state.currentUserId);
  const projectBoards = useMemo(() => boards.filter((entry) => entry.projectId === project?.id), [boards, project?.id]);
  const active = sprints.find((sprint) => sprint.state === "active");
  const [boardId, setBoardId] = useState("");
  const [sprintId, setSprintId] = useState(active?.id ?? sprints[0]?.id ?? "");
  const [kind, setKind] = useState<"all" | ItemKind>(lockedKind ?? "all");
  const [mine, setMine] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [query, setQuery] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [tag, setTag] = useState("");
  const goToItem = useGoToItem();

  const board = projectBoards.find((entry) => entry.id === boardId);
  const allItemsMode = Boolean(board && board.sprintId === null);
  const selectedSprint = allItemsMode ? "" : board?.sprintId || sprintId || active?.id || "";
  const projectItems = items.filter((item) => item.projectId === project?.id);
  const tags = [...new Set(projectItems.flatMap((item) => item.tags))].sort();
  const members = people.filter((person) => project?.memberIds.includes(person.id));
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (!project || item.projectId !== project.id) return false;
        if (!allItemsMode) {
          if (selectedSprint && item.sprintId !== selectedSprint) return false;
          if (!selectedSprint && item.sprintId) return false;
        }
        if (kind !== "all" && item.kind !== kind) return false;
        if (mine && item.assigneeId !== currentUserId) return false;
        if (assigneeIds.length > 0 && !assigneeIds.includes(item.assigneeId ?? "")) return false;
        if (tag && !item.tags.includes(tag)) return false;
        if (!showCancelled && columnOf(item.kind, item.status) === "cancelled") return false;
        if (text && !`${item.key} ${item.title}`.toLowerCase().includes(text)) return false;
        return true;
      })
      .sort(byRank);
  }, [items, project, selectedSprint, allItemsMode, kind, mine, currentUserId, showCancelled, assigneeIds, tag, query]);
  useEffect(() => {
    rememberBrowse(visible.map((item) => item.id));
  }, [visible]);

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <PageHeading title={lockedKind === "defect" ? "缺陷看板" : board?.name ?? "看板"} hint="跨列拖动走状态流转。同一列上下拖是排序。列头可以填在制品上限，超出只提示。" />
          <select
            aria-label="看板"
            className="type-body h-10 max-w-40 shrink-0 rounded-sm border border-border bg-surface px-2"
            value={boardId}
            onChange={(event) => setBoardId(event.target.value)}
          >
            <option value="">当前迭代</option>
            {projectBoards.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
        <BoardFilterBar
            sprints={sprints}
            people={members}
            tags={tags}
            query={query}
            sprintId={selectedSprint}
            kind={kind}
            mine={mine}
            showCancelled={showCancelled}
            assigneeIds={assigneeIds}
            tag={tag}
            onQuery={setQuery}
            onSprint={setSprintId}
            onKind={setKind}
            onMine={setMine}
            onCancelled={setShowCancelled}
            onAssignees={setAssigneeIds}
            onTag={setTag}
            hideKind={lockedKind != null}
          />
      </div>
      <KanbanBoard
        items={visible}
        catalog={projectItems}
        people={people}
        limits={project.wip}
        onOpen={goToItem}
        onLimit={(column, limit) => {
          const wip = { ...project.wip };
          if (limit == null || limit <= 0) delete wip[column];
          else wip[column] = limit;
          usePm.getState().updateProject(project.id, { wip });
        }}
        onMove={(id, column, beforeId) => {
          const item = items.find((entry) => entry.id === id);
          if (!item) return { ok: false, message: "事项不存在" };
          if (columnOf(item.kind, item.status) !== column) {
            const moved = usePm.getState().moveToColumn(id, column);
            if (!moved.ok) return moved;
          }
          const lane = usePm
            .getState()
            .items.filter((entry) => entry.projectId === project.id && columnOf(entry.kind, entry.status) === column)
            .map((entry) => entry.id);
          usePm.getState().placeItem(id, beforeId, lane);
          return { ok: true };
        }}
      />
    </div>
  );
}
