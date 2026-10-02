import { Button, Input, Label, TextField } from "@heroui/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppModal, BoardFilterBar, EmptyHint, KanbanBoard, OptionSelect, PageHeading } from "@/components/biz";
import type { ColumnId, ItemKind } from "@/lib/pm/domain";
import { statusLabel, transitionName } from "@/lib/pm/domain";
import { confirmBoardMove, selectBoardItems, type PendingBoardMove } from "@/lib/pm/board-presentation";
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
  const [pendingMove, setPendingMove] = useState<PendingBoardMove | null>(null);
  const pendingMoveRef = useRef<PendingBoardMove | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const goToItem = useGoToItem();

  const board = projectBoards.find((entry) => entry.id === boardId);
  const allItemsMode = Boolean(board && board.sprintId === null);
  const selectedSprint = allItemsMode ? "" : board?.sprintId || sprintId || active?.id || "";
  const selectedKind = lockedKind ?? kind;
  const visible = useMemo(() => selectBoardItems(items, {
    projectId: project?.id,
    sprintId: selectedSprint,
    allItemsMode,
    kind: selectedKind,
    mine,
    currentUserId,
    showCancelled,
  }), [items, project?.id, selectedSprint, allItemsMode, selectedKind, mine, currentUserId, showCancelled]);

  function closeMove() {
    pendingMoveRef.current = null;
    setPendingMove(null);
    setReason("");
    setReasonError("");
  }

  function moveItem(id: string, column: ColumnId) {
    if (pendingMoveRef.current) return;
    const item = usePm.getState().items.find((entry) => entry.id === id);
    if (!item) {
      toast.error("事项不存在");
      return;
    }
    const result = usePm.getState().moveToColumn(id, column, undefined, item.status);
    if (result.ok) return;
    if (!result.requiresReason) {
      toast.error(result.message);
      return;
    }
    const pending = { id, key: item.key, kind: item.kind, column, fromStatus: item.status, toStatus: result.requiresReason };
    pendingMoveRef.current = pending;
    setPendingMove(pending);
    setReason("");
    setReasonError("");
  }

  function confirmMove() {
    const result = confirmBoardMove(pendingMoveRef.current, reason, usePm.getState().moveToColumn);
    if (!result) return;
    if (!result.ok) {
      setReasonError(result.message);
      return;
    }
    closeMove();
  }

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
            kind={selectedKind}
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
      <KanbanBoard items={visible.items} cancelledItems={visible.cancelledItems} showCancelled={showCancelled} people={people} onOpen={goToItem} onMove={moveItem} />
      <AppModal open={pendingMove !== null} title="填写流转原因" onClose={closeMove} size="md">
        {pendingMove ? (
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); confirmMove(); }}>
            <p className="type-body">{pendingMove.key}：{statusLabel(pendingMove.kind, pendingMove.fromStatus)} → {statusLabel(pendingMove.kind, pendingMove.toStatus)}</p>
            <TextField value={reason} onChange={(value) => { setReason(value); setReasonError(""); }} isRequired isInvalid={Boolean(reasonError)}>
              <Label>{transitionName(pendingMove.kind, pendingMove.fromStatus, pendingMove.toStatus)}需要原因</Label>
              <Input autoFocus placeholder="写给生命周期历史" />
            </TextField>
            {reasonError ? <p className="type-caption text-danger" role="alert">{reasonError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onPress={closeMove}>取消</Button>
              <Button type="submit" variant="primary" isDisabled={!reason.trim()}>确认流转</Button>
            </div>
          </form>
        ) : null}
      </AppModal>
    </div>
  );
}
