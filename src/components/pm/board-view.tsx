import { useMemo, useState } from "react";
import { BoardFilterBar, EmptyHint, KanbanBoard, OptionSelect, PageHeading } from "@/components/biz";
import type { ItemKind } from "@/lib/pm/domain";
import { columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { useGoToItem } from "@/components/pm/use-go-item";

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
  const goToItem = useGoToItem();

  const board = projectBoards.find((entry) => entry.id === boardId);
  const allItemsMode = Boolean(board && board.sprintId === null);
  const selectedSprint = allItemsMode ? "" : board?.sprintId || sprintId || active?.id || "";
  const visible = useMemo(() => {
    return items.filter((item) => {
      if (!project || item.projectId !== project.id) return false;
      if (!allItemsMode) {
        if (selectedSprint && item.sprintId !== selectedSprint) return false;
        if (!selectedSprint && item.sprintId) return false;
      }
      if (kind !== "all" && item.kind !== kind) return false;
      if (mine && item.assigneeId !== currentUserId) return false;
      if (!showCancelled && columnOf(item.kind, item.status) === "cancelled") return false;
      return true;
    });
  }, [items, project, selectedSprint, allItemsMode, kind, mine, currentUserId, showCancelled]);

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-6 pb-3 md:flex-row md:items-end md:justify-between">
        <PageHeading title={lockedKind === "defect" ? "缺陷看板" : board?.name ?? "看板"} hint={lockedKind === "defect" ? "只看缺陷。拖到另一列仍然走缺陷自己的状态。" : "拖到另一列只会走允许的状态流转。主看板看全部事项，其他看板锁定迭代。"} />
        <div className="flex flex-col gap-3 md:items-end">
          <OptionSelect
            label="看板"
            value={boardId}
            options={[{ id: "", label: "当前迭代" }, ...projectBoards.map((entry) => ({ id: entry.id, label: entry.name }))]}
            onChange={setBoardId}
          />
          <BoardFilterBar
          sprints={sprints}
          sprintId={selectedSprint}
          kind={kind}
          mine={mine}
          showCancelled={showCancelled}
          me={people.find((person) => person.id === currentUserId)}
          onSprint={setSprintId}
          onKind={setKind}
          onMine={setMine}
          onCancelled={setShowCancelled}
          hideKind={lockedKind != null}
        />
        </div>
      </div>
      <KanbanBoard items={visible} people={people} onOpen={goToItem} onMove={(id, column) => usePm.getState().moveToColumn(id, column)} />
    </div>
  );
}
