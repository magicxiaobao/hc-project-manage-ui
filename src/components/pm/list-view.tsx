import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { ProjectViewSearch } from "@/lib/pm/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyHint, ListFilterBar, PageHeading, PersonSelect } from "@/components/biz";
import { rememberBrowse, useGoToItem } from "@/components/pm/use-go-item";
import { columnOf, needsReason, nextStatuses, statusLabel, type WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

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
  const members = people.filter((person) => project.memberIds.includes(person.id));
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
      <div className="overflow-x-auto rounded-sm border border-border bg-surface">
        <table className="w-full border-collapse text-left">
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
                  <EmptyHint>没有符合筛选的事项</EmptyHint>
                </td>
              </tr>
            ) : null}
            {rows.map((item) => {
              const sprint = sprints.find((entry) => entry.id === item.sprintId);
              const choices = [
                item.status,
                ...nextStatuses(item).filter((status) => status !== item.status),
              ];
              return (
                <tr key={item.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <button
                      data-focus-key={`item-key:${item.id}`}
                      type="button"
                      className="type-link"
                      onClick={() => goToItem(item.id)}
                    >
                      {item.key}
                    </button>
                  </td>
                  <td className="max-w-64 px-3 py-2">
                    <button
                      data-focus-key={`item-title:${item.id}`}
                      type="button"
                      className="type-body block max-w-full truncate text-left"
                      onClick={() => goToItem(item.id)}
                    >
                      {item.title}
                    </button>
                  </td>
                  <td className="type-caption px-3 py-2">
                    {item.priority === "HIGH" ? "高" : item.priority === "LOW" ? "低" : "中"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`${item.key} 状态`}
                      className="type-caption h-8 max-w-36 rounded-sm border border-border bg-surface px-1"
                      value={item.status}
                      onChange={(event) => {
                        const to = event.target.value;
                        if (to === item.status) return;
                        if (needsReason(to)) {
                          toast("这次流转要填原因，请打开事项。");
                          goToItem(item.id);
                          return;
                        }
                        const result = usePm.getState().transition(item.id, to);
                        if (!result.ok) toast(result.message);
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
                    <PersonSelect
                      showRole={false}
                      people={members}
                      value={item.assigneeId ?? ""}
                      onChange={(assigneeId) =>
                        usePm.getState().updateItem(item.id, { assigneeId: assigneeId || null })
                      }
                    />
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
                        onChange={(event) =>
                          usePm
                            .getState()
                            .updateItem(item.id, { storyPoints: Number(event.target.value) })
                        }
                      />
                    )}
                  </td>
                  <td className="type-caption hidden px-3 py-2 md:table-cell">
                    {sprint?.name ?? "未排期"}
                  </td>
                  <td className="type-caption px-3 py-2">{item.updatedAt.slice(5, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
