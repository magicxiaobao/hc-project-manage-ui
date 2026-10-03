import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import {
  clearListFiltersPatch,
  deriveListScope,
  headerSortState,
  scopeSearchPatch,
  type ListGroupId,
  type ListScope,
  type ListSortColumn,
  type ProjectViewSearch,
} from "@/lib/pm/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NumberField } from "@heroui/react";
import { toast } from "sonner";
import { EmptyHint, ListFilterBar, PageHeading, PersonSelect } from "@/components/biz";
import { rememberBrowse, useGoToItem } from "@/components/pm/use-go-item";
import { columnOf, kindLabel, needsReason, nextStatuses, statusLabel, COLUMNS, type ColumnId, type Priority, type WorkItem } from "@/lib/pm/domain";
import { storyPointsWrite } from "@/lib/pm/edit-rules";
import { usePm } from "@/lib/pm/store";
import { PersistenceStatus } from "@/components/biz/persistence-status";
import { cn } from "@/lib/utils";

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const SCOPES: { id: ListScope; label: string }[] = [
  { id: "open", label: "未完成" },
  { id: "mine", label: "我的未完成" },
  { id: "doing", label: "进行中" },
  { id: "done", label: "已完成" },
  { id: "cancelled", label: "已取消" },
  { id: "all", label: "全部" },
];
const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "HIGH", label: "高" },
  { id: "MEDIUM", label: "中" },
  { id: "LOW", label: "低" },
];
const BULK_COLUMNS: { id: ColumnId | "cancelled"; name: string }[] = [...COLUMNS, { id: "cancelled", name: "已取消" }];

export function ListView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const currentUserId = usePm((state) => state.currentUserId);
  const search = useSearch({ from: "/p/$projectKey" });
  const navigate = useNavigate();
  const router = useRouter();
  const [query, setQuery] = useState(search.query ?? "");
  const [edited, setEdited] = useState<{ id: string; accepted: boolean } | null>(null);
  const ready = usePm((state) => state.ready);
  const persistenceError = usePm((state) => state.persistenceError);
  useEffect(() => {
    // Do not overwrite immediate typing with an older committed route match.
    if ((search.query ?? "") === (router.state.location.search.query ?? "")) {
      setQuery(search.query ?? "");
    }
  }, [search.query, router]);
  const kind = search.kind ?? "all";
  const mine = search.mine ?? false;
  const hideDone = search.hideDone ?? true;
  const sortKey = search.sort ?? "updated";
  const ascending = search.ascending ?? false;
  const setFilter = (patch: ProjectViewSearch) => {
    void navigate({
      href:
        router.state.location.pathname +
        router.options.stringifySearch!({ ...router.state.location.search, ...patch }),
      replace: true,
    });
  };
  const scope = deriveListScope(search);
  const priority = search.priority ?? "all";
  const grouped = search.grouped ?? true;
  const closedGroups = search.closedGroups ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkColumn, setBulkColumn] = useState<ColumnId | "cancelled" | "">("");
  const goToItem = useGoToItem();

  const scoped = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items
      .filter((item) => item.projectId === project?.id)
      .filter((item) => (kind === "all" ? true : item.kind === kind))
      .filter((item) => (text ? `${item.key} ${item.title}`.toLowerCase().includes(text) : true));
  }, [items, project, kind, query]);
  const inScope = useMemo(() => scoped.filter((item) => matchesScope(item, scope, currentUserId)), [scoped, scope, currentUserId]);
  const rows = useMemo(() => {
    const filtered = inScope.filter((item) => (priority === "all" ? true : item.priority === priority));
    const direction = ascending ? 1 : -1;
    return filtered.sort((a, b) => direction * compareRow(a, b, sortKey));
  }, [inScope, priority, sortKey, ascending]);

  useEffect(() => {
    rememberBrowse(rows.map((item) => item.id));
  }, [rows]);
  useEffect(() => {
    const visible = new Set(rows.map((item) => item.id));
    setSelected((current) => {
      const next = current.filter((id) => visible.has(id));
      return next.length === current.length ? current : next;
    });
  }, [rows]);

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;
  const hasProjectItems = items.some((item) => item.projectId === project.id);
  const showEdit = (id: string, result: { ok: true } | { ok: false; message: string }) => {
    setEdited({ id, accepted: result.ok });
    if (!result.ok) toast(result.message);
  };
  const members = people.filter((person) => project.memberIds.includes(person.id));
  const renderIssueRow = (item: WorkItem) => {
    const sprint = sprints.find((entry) => entry.id === item.sprintId);
    const choices = [item.status, ...nextStatuses(item).filter((status) => status !== item.status)];
    const column = columnOf(item.kind, item.status);
    const overdue = Boolean(item.dueDate) && item.dueDate! < localDay() && column !== "done" && column !== "cancelled";
    const checked = selected.includes(item.id);
    return (
      <tr key={item.id} className="border-b border-border last:border-b-0">
        <td className="px-3 py-2">
          <input aria-label={`选择 ${item.key}`} type="checkbox" className="size-4" checked={checked} onChange={() => setSelected((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))} />
        </td>
        <td className="px-3 py-2">
          <button data-focus-key={`item-key:${item.id}`} type="button" className="type-link whitespace-nowrap" onClick={() => goToItem(item.id)}>
            {item.key}
          </button>
          <span className="type-caption block">{kindLabel(item)}</span>
        </td>
        <td className="max-w-64 px-3 py-2">
          <button data-focus-key={`item-title:${item.id}`} type="button" className="type-body block max-w-full truncate text-left" title={item.title} onClick={() => goToItem(item.id)}>
            {item.title}
          </button>
          {edited?.id === item.id ? (
            <div className="mt-2">
              <PersistenceStatus ready={ready} error={persistenceError} saved={edited.accepted} automatic onRetry={() => usePm.getState().retryPersistence()} />
            </div>
          ) : null}
        </td>
        <td className="type-caption px-3 py-2">{item.priority === "HIGH" ? "高" : item.priority === "LOW" ? "低" : "中"}</td>
        <td className="px-3 py-2">
          <select
            aria-label={`${item.key} 状态`}
            className="type-body h-8 max-w-36 rounded-sm border border-border bg-surface px-1"
            value={item.status}
            onChange={(event) => {
              const to = event.target.value;
              if (to === item.status) return;
              if (needsReason(to)) {
                toast("这次流转要填原因，请打开事项。");
                goToItem(item.id);
                return;
              }
              showEdit(item.id, usePm.getState().transition(item.id, to));
            }}
          >
            {choices.map((status) => (
              <option key={status} value={status}>
                {statusLabel(item.kind, status)}
              </option>
            ))}
          </select>
        </td>
        <td className="w-40 px-3 py-2">
          <PersonSelect showRole={false} people={members} value={item.assigneeId ?? ""} onChange={(assigneeId) => showEdit(item.id, usePm.getState().updateItem(item.id, { assigneeId: assigneeId || null }))} />
        </td>
        <td className="px-3 py-2">
          {item.kind === "defect" ? (
            <span className="type-caption">—</span>
          ) : (
            <StoryPointsCell
              itemKey={item.key}
              value={item.storyPoints ?? 0}
              onWrite={(points) => showEdit(item.id, usePm.getState().updateItem(item.id, { storyPoints: points }))}
            />
          )}
        </td>
        <td className={cn("type-caption whitespace-nowrap px-3 py-2", overdue && "text-danger")}>{item.dueDate ? item.dueDate.slice(5) : "—"}</td>
        <td className="type-caption hidden px-3 py-2 md:table-cell">{sprint?.name ?? "未排期"}</td>
        <td className="type-caption px-3 py-2">{item.updatedAt.slice(5, 10)}</td>
      </tr>
    );
  };
  const sort = (key: ListSortColumn) => {
    if (sortKey === key) setFilter({ ascending: !ascending });
    else {
      setFilter({ sort: key, ascending: key === "key" || key === "title" || key === "due" });
    }
  };
  const visibleIds = rows.map((item) => item.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const assignSelected = (assigneeId: string) => {
    const next = assigneeId === "none" ? null : assigneeId;
    let changed = 0;
    for (const id of selected) {
      const result = usePm.getState().updateItem(id, { assigneeId: next });
      if (result.ok) changed += 1;
    }
    toast(changed > 0 ? `已更新 ${changed} 项负责人` : "负责人没有改。");
  };
  const moveSelected = () => {
    if (!bulkColumn) return;
    let moved = 0;
    let blocked = 0;
    let needs = 0;
    for (const id of selected) {
      const item = items.find((entry) => entry.id === id);
      if (!item) continue;
      if (columnOf(item.kind, item.status) === bulkColumn) continue;
      const to = nextStatuses(item).find((status) => columnOf(item.kind, status) === bulkColumn);
      if (!to) {
        blocked += 1;
        continue;
      }
      if (needsReason(to)) {
        needs += 1;
        continue;
      }
      const result = usePm.getState().transition(item.id, to);
      if (result.ok) moved += 1;
      else blocked += 1;
    }
    const notes = [`已流转 ${moved} 项`];
    if (blocked > 0) notes.push(`${blocked} 项不能直接过去`);
    if (needs > 0) notes.push(`${needs} 项要填写原因，请打开事项`);
    toast(notes.join("，"));
    setBulkColumn("");
  };
  const scopeCount = (id: ListScope) => scoped.filter((item) => matchesScope(item, id, currentUserId)).length;
  const priorityCount = (id: Priority) => inScope.filter((item) => item.priority === id).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:flex-row md:p-6">
      <aside className="flex gap-4 overflow-x-auto md:w-44 md:shrink-0 md:flex-col md:overflow-visible">
        <div className="flex min-w-max flex-col gap-1 md:min-w-0">
          {SCOPES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={scope === entry.id}
              className={cn("type-body flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left", scope === entry.id ? "bg-primary-soft text-primary-ink" : "hover:bg-line")}
              onClick={() => setFilter(scopeSearchPatch(entry.id, search))}
            >
              <span>{entry.label}</span>
              <span className="type-caption">{scopeCount(entry.id)}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-max flex-col gap-1 md:min-w-0">
          <p className="type-caption px-2">优先级</p>
          <button type="button" aria-pressed={priority === "all"} className={cn("type-body rounded-sm px-2 py-1.5 text-left", priority === "all" ? "bg-primary-soft text-primary-ink" : "hover:bg-line")} onClick={() => setFilter({ priority: undefined })}>
            全部
          </button>
          {PRIORITIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={priority === entry.id}
              className={cn("type-body flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left", priority === entry.id ? "bg-primary-soft text-primary-ink" : "hover:bg-line")}
              onClick={() => setFilter({ priority: entry.id })}
            >
              <span>{entry.label}</span>
              <span className="type-caption">{priorityCount(entry.id)}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading title="事项" hint="左侧切换范围。勾选后可批量改负责人或状态。过期的截止日期会标红。" />
        <ListFilterBar
          query={query}
          kind={kind}
          mine={mine}
          hideDone={hideDone}
          showScope={false}
          onQuery={(query) => {
            setQuery(query);
            setFilter({ query });
          }}
          onKind={(kind) => setFilter({ kind: kind as ProjectViewSearch["kind"] })}
          onMine={(mine) => setFilter({ mine })}
          onHideDone={(hideDone) => setFilter({ hideDone })}
        />
      </div>
      <p className="type-meta flex flex-wrap items-center gap-3">
        <span>{rows.length} 项</span>
        <button type="button" className="type-link" aria-pressed={grouped} onClick={() => setFilter(grouped ? { grouped: false } : { grouped: undefined })}>
          {grouped ? "取消按状态分组" : "按状态分组"}
        </button>
      </p>
      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2">
          <span className="type-caption">已选 {selected.length}</span>
          <select aria-label="批量改负责人" className="type-body h-8 rounded-sm border border-border bg-surface px-2" value="" onChange={(event) => assignSelected(event.target.value)}>
            <option value="" disabled>改负责人</option>
            <option value="none">未分配</option>
            {members.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
          <select aria-label="批量改状态列" className="type-body h-8 rounded-sm border border-border bg-surface px-2" value={bulkColumn} onChange={(event) => setBulkColumn(event.target.value as ColumnId | "cancelled" | "")}>
            <option value="">改到哪一列</option>
            {BULK_COLUMNS.map((column) => (
              <option key={column.id} value={column.id}>{column.name}</option>
            ))}
          </select>
          <button type="button" className="type-body min-h-8 rounded-sm border border-border px-2" disabled={!bulkColumn} onClick={moveSelected}>改状态</button>
          <button type="button" className="type-link" onClick={() => setSelected([])}>清除</button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        <label className="type-label" htmlFor="mobile-issue-sort">排序</label>
        <select id="mobile-issue-sort" className="rounded-sm border border-border bg-surface px-2" value={sortKey} onChange={(event) => sort(event.target.value as ListSortColumn)}>
          {[ ["key", "编号"], ["title", "标题"], ["priority", "优先级"], ["status", "状态"], ["points", "点数"], ["due", "截止"], ["updated", "更新"] ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" className="type-link rounded-sm border border-border px-3" onClick={() => setFilter({ ascending: !ascending })}>{ascending ? "升序" : "降序"}</button>
      </div>
      <div className="overflow-x-auto rounded-sm border border-border bg-surface">
        <table className="pm-issue-table w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2">
                <input
                  aria-label="全选当前列表"
                  type="checkbox"
                  className="size-4"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? [] : visibleIds)}
                />
              </th>
              <Header label="编号" column="key" sortKey={sortKey} ascending={ascending} onClick={() => sort("key")} />
              <Header label="标题" column="title" sortKey={sortKey} ascending={ascending} onClick={() => sort("title")} />
              <Header label="优先级" column="priority" sortKey={sortKey} ascending={ascending} onClick={() => sort("priority")} />
              <Header label="状态" column="status" sortKey={sortKey} ascending={ascending} onClick={() => sort("status")} />
              <th className="type-caption px-3 py-2 font-normal">负责人</th>
              <Header label="点数" column="points" sortKey={sortKey} ascending={ascending} onClick={() => sort("points")} />
              <Header label="截止" column="due" sortKey={sortKey} ascending={ascending} onClick={() => sort("due")} />
              <th className="type-caption hidden px-3 py-2 font-normal md:table-cell">迭代</th>
              <Header label="更新" column="updated" sortKey={sortKey} ascending={ascending} onClick={() => sort("updated")} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyHint>{hasProjectItems ? "没有符合筛选的事项。" : "这个项目还没有事项。"}</EmptyHint>
                  <div className="flex justify-center pb-4">
                    {hasProjectItems ? <button type="button" className="type-link min-h-10 rounded-sm border border-border px-3" onClick={() => { setQuery(""); setFilter(clearListFiltersPatch()); }}>清空筛选，查看全部事项</button> : <button type="button" className="type-link min-h-10 rounded-sm border border-border px-3" onClick={() => usePm.getState().setCreateOpen(true)}>创建工作项</button>}
                  </div>
                </td>
              </tr>
            ) : grouped ? (
              (["todo", "doing", "check", "done", "cancelled"] as ListGroupId[]).map((column) => {
                const group = rows.filter((item) => columnOf(item.kind, item.status) === column);
                if (group.length === 0) return null;
                const name = COLUMNS.find((entry) => entry.id === column)?.name ?? "已取消";
                const collapsed = closedGroups.includes(column);
                return (
                  <GroupRows
                    key={column}
                    name={name}
                    count={group.length}
                    collapsed={collapsed}
                    onToggle={() => {
                      const next = closedGroups.includes(column)
                        ? closedGroups.filter((entry) => entry !== column)
                        : [...closedGroups, column];
                      const unique = next.filter((id, index) => next.indexOf(id) === index);
                      setFilter({ closedGroups: unique.length ? unique : undefined });
                    }}
                  >
                    {group.map((item) => renderIssueRow(item))}
                  </GroupRows>
                );
              })
            ) : (
              rows.map((item) => renderIssueRow(item))
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

function GroupRows({
  name,
  count,
  collapsed,
  onToggle,
  children,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="bg-line/70">
        <td colSpan={10} className="px-3 py-2">
          <button type="button" className="type-emphasis" onClick={onToggle}>
            {collapsed ? "展开" : "收起"} {name} · {count}
          </button>
        </td>
      </tr>
      {collapsed ? null : children}
    </>
  );
}

function matchesScope(item: WorkItem, scope: ListScope, userId: string) {
  const column = columnOf(item.kind, item.status);
  if (scope === "all") return true;
  if (scope === "mine") return item.assigneeId === userId && column !== "done" && column !== "cancelled";
  if (scope === "doing") return column === "doing";
  if (scope === "done") return column === "done";
  if (scope === "cancelled") return column === "cancelled";
  return column !== "done" && column !== "cancelled";
}

function localDay() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function compareRow(a: WorkItem, b: WorkItem, key: ListSortColumn) {
  if (key === "key") return a.key.localeCompare(b.key);
  if (key === "title") return a.title.localeCompare(b.title, "zh");
  if (key === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (key === "status") return a.status.localeCompare(b.status);
  if (key === "points") return (a.storyPoints ?? -1) - (b.storyPoints ?? -1);
  if (key === "due") return (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");
  return a.updatedAt.localeCompare(b.updatedAt);
}

function Header({
  label,
  column,
  sortKey,
  ascending,
  onClick,
}: {
  label: string;
  column: ListSortColumn;
  sortKey: ListSortColumn;
  ascending: boolean;
  onClick: () => void;
}) {
  const sortState = headerSortState(column, sortKey, ascending);
  return (
    <th className="px-3 py-2 font-normal" aria-sort={sortState.ariaSort}>
      <button type="button" className={sortState.direction ? "type-emphasis" : "type-caption"} onClick={onClick}>
        {label}
        {sortState.direction ? ` ${sortState.direction}` : ""}
      </button>
    </th>
  );
}

function StoryPointsCell({ itemKey, value, onWrite }: { itemKey: string; value: number; onWrite: (points: number) => void }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  const dirty = useRef(false);
  const fromStepper = useRef(false);
  useEffect(() => {
    if (!dirty.current) {
      latest.current = value;
      setDraft(value);
    }
  }, [value]);
  const commit = (next: number) => {
    const written = storyPointsWrite(next);
    dirty.current = false;
    latest.current = written;
    setDraft(written);
    onWrite(written);
  };
  return (
    <NumberField
      aria-label={`${itemKey} 故事点`}
      minValue={0}
      value={draft}
      className="w-28"
      onChange={(next) => {
        const written = storyPointsWrite(next);
        latest.current = written;
        setDraft(written);
        if (fromStepper.current) {
          fromStepper.current = false;
          dirty.current = false;
          onWrite(written);
          return;
        }
        dirty.current = true;
      }}
      onBlur={() => {
        if (dirty.current) commit(latest.current);
      }}
    >
      <NumberField.Group className="h-8">
        <NumberField.DecrementButton onPointerDown={() => { fromStepper.current = true; }} />
        <NumberField.Input />
        <NumberField.IncrementButton onPointerDown={() => { fromStepper.current = true; }} />
      </NumberField.Group>
    </NumberField>
  );
}

