import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppModal, BoardFilterBar, EmptyHint, KanbanBoard, PageHeading } from "@/components/biz";
import { rememberBrowse, useGoToItem } from "@/components/pm/use-go-item";
import {
  byRank,
  columnOf,
  statusLabel,
  transitionName,
  type ColumnId,
  type ItemKind,
} from "@/lib/pm/domain";
import {
  confirmBoardMove,
  selectBoardItems,
  type BoardMoveResult,
  type PendingBoardMove,
} from "@/lib/pm/board-presentation";
import type { ProjectViewSearch } from "@/lib/pm/navigation";
import { usePm } from "@/lib/pm/store";

type PendingRankMove = PendingBoardMove & { beforeId: string | null };

export function BoardView({
  projectKey,
  lockedKind,
}: {
  projectKey: string;
  lockedKind?: ItemKind;
}) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allSprints = usePm((state) => state.sprints);
  const sprints = useMemo(
    () => allSprints.filter((entry) => entry.projectId === project?.id),
    [allSprints, project?.id],
  );
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const boards = usePm((state) => state.boards);
  const currentUserId = usePm((state) => state.currentUserId);
  const projectBoards = useMemo(
    () => boards.filter((entry) => entry.projectId === project?.id),
    [boards, project?.id],
  );
  const active = sprints.find((sprint) => sprint.state === "active");
  const search = useSearch({ from: "/p/$projectKey" });
  const navigate = useNavigate();
  const router = useRouter();
  const boardId = search.board ?? "";
  const sprintId = search.sprint ?? active?.id ?? sprints[0]?.id ?? "";
  const kind = lockedKind ?? search.kind ?? "all";
  const mine = search.mine ?? false;
  const showCancelled = search.cancelled ?? false;
  const assigneeIds = useMemo(() => search.assignees ?? [], [search.assignees]);
  const tag = search.tag ?? "";
  const [query, setQuery] = useState(search.query ?? "");
  useEffect(() => {
    if ((search.query ?? "") === (router.state.location.search.query ?? ""))
      setQuery(search.query ?? "");
  }, [search.query, router]);
  const setFilter = (patch: ProjectViewSearch) => {
    void navigate({
      href:
        router.state.location.pathname +
        router.options.stringifySearch!({ ...router.state.location.search, ...patch }),
      replace: true,
    });
  };
  const [pendingMove, setPendingMove] = useState<PendingRankMove | null>(null);
  const pendingMoveRef = useRef<PendingRankMove | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const goToItem = useGoToItem();
  const board = projectBoards.find((entry) => entry.id === boardId);
  const allItemsMode = Boolean(board && board.sprintId === null);
  const selectedSprint = allItemsMode ? "" : board?.sprintId || sprintId || active?.id || "";
  const projectItems = items.filter((item) => item.projectId === project?.id);
  const tags = [...new Set(projectItems.flatMap((item) => item.tags))].sort();
  const members = people.filter((person) => project?.memberIds.includes(person.id));
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const filtered = items
      .filter(
        (item) =>
          (assigneeIds.length === 0 || assigneeIds.includes(item.assigneeId ?? "")) &&
          (!tag || item.tags.includes(tag)) &&
          (!text || `${item.key} ${item.title}`.toLowerCase().includes(text)),
      )
      .sort(byRank);
    return selectBoardItems(filtered, {
      projectId: project?.id,
      sprintId: selectedSprint,
      allItemsMode,
      kind,
      mine,
      currentUserId,
      showCancelled,
    });
  }, [
    items,
    project?.id,
    selectedSprint,
    allItemsMode,
    kind,
    mine,
    currentUserId,
    showCancelled,
    assigneeIds,
    tag,
    query,
  ]);
  useEffect(() => {
    rememberBrowse([...visible.items, ...visible.cancelledItems].map((item) => item.id));
  }, [visible]);

  function closeMove() {
    pendingMoveRef.current = null;
    setPendingMove(null);
    setReason("");
    setReasonError("");
  }

  function targetAvailable(column: ColumnId, beforeId: string | null) {
    if (!beforeId) return true;
    const target = usePm.getState().items.find((entry) => entry.id === beforeId);
    return Boolean(
      target && target.projectId === project?.id && columnOf(target.kind, target.status) === column,
    );
  }

  function rankItem(id: string, column: ColumnId, beforeId: string | null) {
    const data = usePm.getState();
    const lane = data.items
      .filter(
        (entry) => entry.projectId === project?.id && columnOf(entry.kind, entry.status) === column,
      )
      .map((entry) => entry.id);
    data.placeItem(id, beforeId, lane);
  }

  function moveItem(id: string, column: ColumnId, beforeId: string | null): BoardMoveResult {
    // A second drop cannot replace or duplicate the pending confirmation.
    if (pendingMoveRef.current) return { ok: true };
    const item = usePm.getState().items.find((entry) => entry.id === id);
    if (!item || item.projectId !== project?.id) return { ok: false, message: "事项不存在" };
    if (columnOf(item.kind, item.status) === "cancelled")
      return { ok: false, message: "已取消或已拒绝事项不能拖拽。" };
    if (!targetAvailable(column, beforeId))
      return { ok: false, message: "排序目标已变化，请重新拖动。" };
    const result = usePm.getState().moveToColumn(id, column, undefined, item.status);
    if (result.ok) {
      rankItem(id, column, beforeId);
      return result;
    }
    if (!result.requiresReason) return result;
    const pending = {
      id,
      key: item.key,
      kind: item.kind,
      column,
      beforeId,
      fromStatus: item.status,
      toStatus: result.requiresReason,
    };
    pendingMoveRef.current = pending;
    setPendingMove(pending);
    setReason("");
    setReasonError("");
    return { ok: true };
  }

  function confirmMove() {
    const pending = pendingMoveRef.current;
    if (!pending) return;
    if (!targetAvailable(pending.column, pending.beforeId)) {
      setReasonError("排序目标已变化，请取消后重新拖动。");
      return;
    }
    const result = confirmBoardMove(pending, reason, usePm.getState().moveToColumn);
    if (!result) return;
    if (!result.ok) {
      setReasonError(result.message);
      return;
    }
    rankItem(pending.id, pending.column, pending.beforeId);
    closeMove();
  }

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <PageHeading
            title={lockedKind === "defect" ? "缺陷看板" : (board?.name ?? "看板")}
            hint="跨列拖动走状态流转。同一列上下拖是排序。列头可以填在制品上限，超出只提示。"
          />
          <select
            aria-label="看板"
            className="type-body h-10 max-w-40 shrink-0 rounded-sm border border-border bg-surface px-2"
            value={boardId}
            onChange={(event) => setFilter({ board: event.target.value })}
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
          onQuery={(query) => {
            setQuery(query);
            setFilter({ query });
          }}
          onSprint={(sprint) => setFilter({ sprint })}
          onKind={(kind) => setFilter({ kind })}
          onMine={(mine) => setFilter({ mine })}
          onCancelled={(cancelled) => setFilter({ cancelled })}
          onAssignees={(assignees) => setFilter({ assignees })}
          onTag={(tag) => setFilter({ tag })}
          hideKind={lockedKind != null}
        />
      </div>
      <KanbanBoard
        items={visible.items}
        cancelledItems={visible.cancelledItems}
        showCancelled={showCancelled}
        catalog={projectItems}
        people={people}
        limits={project.wip}
        onOpen={goToItem}
        onMove={moveItem}
        onLimit={(column, limit) => {
          const wip = { ...project.wip };
          if (limit == null || limit <= 0) delete wip[column];
          else wip[column] = limit;
          usePm.getState().updateProject(project.id, { wip });
        }}
      />
      <AppModal open={pendingMove !== null} title="填写流转原因" onClose={closeMove} size="md">
        {pendingMove ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              confirmMove();
            }}
          >
            <p className="type-body">
              {pendingMove.key}：{statusLabel(pendingMove.kind, pendingMove.fromStatus)} →{" "}
              {statusLabel(pendingMove.kind, pendingMove.toStatus)}
            </p>
            <TextField
              value={reason}
              onChange={(value) => {
                setReason(value);
                setReasonError("");
              }}
              isRequired
              isInvalid={Boolean(reasonError)}
            >
              <Label>
                {transitionName(pendingMove.kind, pendingMove.fromStatus, pendingMove.toStatus)}
                需要原因
              </Label>
              <Input autoFocus placeholder="写给生命周期历史" />
            </TextField>
            {reasonError ? (
              <p className="type-caption text-danger" role="alert">
                {reasonError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onPress={closeMove}>
                取消
              </Button>
              <Button type="submit" variant="primary" isDisabled={!reason.trim()}>
                确认流转
              </Button>
            </div>
          </form>
        ) : null}
      </AppModal>
    </div>
  );
}
