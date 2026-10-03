import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { ProjectViewSearch } from "@/lib/pm/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { EmptyHint, ListFilterBar, PageHeading, PersonSelect } from "@/components/biz";
import { rememberBrowse, useGoToItem } from "@/components/pm/use-go-item";
import { columnOf, kindLabel, needsReason, nextStatuses, statusLabel, COLUMNS, type ColumnId, type WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { PersistenceStatus } from "@/components/biz/persistence-status";

type SortKey = "key" | "title" | "priority" | "status" | "points" | "updated";

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

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
  const [grouped, setGrouped] = useState(true);
  const [closedGroups, setClosedGroups] = useState<ColumnId[]>([]);
  const goToItem = useGoToItem();

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const filtered = items
      .filter((item) => item.projectId === project?.id)
      .filter((item) => (kind === "all" ? true : item.kind === kind))
      .filter((item) => (mine ? item.assigneeId === currentUserId : true))
      .filter((item) => {
        if (!hideDone) return true;
        const column = columnOf(item.kind, item.status);
        return column !== "done" && column !== "cancelled";
      })
      .filter((item) => (text ? `${item.key} ${item.title}`.toLowerCase().includes(text) : true));
    const direction = ascending ? 1 : -1;
    return filtered.sort((a, b) => direction * compareRow(a, b, sortKey));
  }, [items, project, kind, mine, currentUserId, hideDone, query, sortKey, ascending]);

  useEffect(() => {
    rememberBrowse(rows.map((item) => item.id));
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
    return (
      <tr key={item.id} className="border-b border-border last:border-b-0">
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
            <input
              aria-label={`${item.key} 故事点`}
              type="number"
              min={0}
              value={item.storyPoints ?? 0}
              className="type-caption h-8 w-16 rounded-sm border border-border bg-surface px-1"
              onChange={(event) => showEdit(item.id, usePm.getState().updateItem(item.id, { storyPoints: Number(event.target.value) }))}
            />
          )}
        </td>
        <td className="type-caption hidden px-3 py-2 md:table-cell">{sprint?.name ?? "未排期"}</td>
        <td className="type-caption px-3 py-2">{item.updatedAt.slice(5, 10)}</td>
      </tr>
    );
  };
  const sort = (key: SortKey) => {
    if (sortKey === key) setFilter({ ascending: !ascending });
    else {
      setFilter({ sort: key, ascending: key === "key" || key === "title" });
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading title="事项" hint="点表头排序。负责人、状态和故事点可以在这一行改。" />
        <ListFilterBar
          query={query}
          kind={kind}
          mine={mine}
          hideDone={hideDone}
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
        <span>{rows.length} 项 · {hideDone ? "未完成范围" : "全部状态范围"}</span>
        <button type="button" className="type-link" aria-pressed={grouped} onClick={() => setGrouped((value) => !value)}>
          {grouped ? "取消按状态分组" : "按状态分组"}
        </button>
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        <label className="type-label" htmlFor="mobile-issue-sort">排序</label>
        <select id="mobile-issue-sort" className="rounded-sm border border-border bg-surface px-2" value={sortKey} onChange={(event) => sort(event.target.value as SortKey)}>
          {[ ["key", "编号"], ["title", "标题"], ["priority", "优先级"], ["status", "状态"], ["points", "点数"], ["updated", "更新"] ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" className="type-link rounded-sm border border-border px-3" onClick={() => setFilter({ ascending: !ascending })}>{ascending ? "升序" : "降序"}</button>
      </div>
      <div className="overflow-x-auto rounded-sm border border-border bg-surface">
        <table className="pm-issue-table w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <Header label="编号" active={sortKey === "key"} onClick={() => sort("key")} />
              <Header label="标题" active={sortKey === "title"} onClick={() => sort("title")} />
              <Header
                label="优先级"
                active={sortKey === "priority"}
                onClick={() => sort("priority")}
              />
              <Header label="状态" active={sortKey === "status"} onClick={() => sort("status")} />
              <th className="type-caption px-3 py-2 font-normal">负责人</th>
              <Header label="点数" active={sortKey === "points"} onClick={() => sort("points")} />
              <th className="type-caption hidden px-3 py-2 font-normal md:table-cell">迭代</th>
              <Header label="更新" active={sortKey === "updated"} onClick={() => sort("updated")} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyHint>{hasProjectItems ? "没有符合筛选的事项。" : "这个项目还没有事项。"}</EmptyHint>
                  <div className="flex justify-center pb-4">
                    {hasProjectItems ? <button type="button" className="type-link min-h-10 rounded-sm border border-border px-3" onClick={() => { setQuery(""); setFilter({ query: undefined, kind: "all", mine: false, hideDone: false }); }}>清空筛选，查看全部事项</button> : <button type="button" className="type-link min-h-10 rounded-sm border border-border px-3" onClick={() => usePm.getState().setCreateOpen(true)}>创建工作项</button>}
                  </div>
                </td>
              </tr>
            ) : grouped ? (
              (["todo", "doing", "check", "done", "cancelled"] as ColumnId[]).map((column) => {
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
                    onToggle={() => setClosedGroups((current) => (current.includes(column) ? current.filter((entry) => entry !== column) : [...current, column]))}
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
        <td colSpan={8} className="px-3 py-2">
          <button type="button" className="type-emphasis" onClick={onToggle}>
            {collapsed ? "展开" : "收起"} {name} · {count}
          </button>
        </td>
      </tr>
      {collapsed ? null : children}
    </>
  );
}

function compareRow(a: WorkItem, b: WorkItem, key: SortKey) {
  if (key === "key") return a.key.localeCompare(b.key);
  if (key === "title") return a.title.localeCompare(b.title, "zh");
  if (key === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (key === "status") return a.status.localeCompare(b.status);
  if (key === "points") return (a.storyPoints ?? -1) - (b.storyPoints ?? -1);
  return a.updatedAt.localeCompare(b.updatedAt);
}

function Header({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 font-normal">
      <button type="button" className={active ? "type-emphasis" : "type-caption"} onClick={onClick}>
        {label}
      </button>
    </th>
  );
}
