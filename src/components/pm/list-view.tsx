import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { ProjectViewSearch } from "@/lib/pm/navigation";
import { useMemo } from "react";
import { EmptyHint, IssueRow, ListFilterBar, PageHeading } from "@/components/biz";
import { columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { useGoToItem } from "@/components/pm/use-go-item";

export function ListView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const currentUserId = usePm((state) => state.currentUserId);
  const search = useSearch({ from: "/p/$projectKey" });
  const navigate = useNavigate();
  const router = useRouter();
  const query = search.query ?? "";
  const kind = search.kind ?? "all";
  const mine = search.mine ?? false;
  const hideDone = search.hideDone ?? true;
  const setFilter = (patch: ProjectViewSearch) => {
    void navigate({
      href:
        router.state.location.pathname + router.options.stringifySearch!({ ...search, ...patch }),
      replace: true,
    });
  };
  const goToItem = useGoToItem();

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items
      .filter((item) => item.projectId === project?.id)
      .filter((item) => (kind === "all" ? true : item.kind === kind))
      .filter((item) => (mine ? item.assigneeId === currentUserId : true))
      .filter((item) => {
        if (!hideDone) return true;
        const column = columnOf(item.kind, item.status);
        return column !== "done" && column !== "cancelled";
      })
      .filter((item) => (text ? `${item.key} ${item.title}`.toLowerCase().includes(text) : true))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [items, project, kind, mine, currentUserId, hideDone, query]);

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeading title="事项" hint="需求、任务和缺陷在同一张清单里。点一行打开事项。" />
        <ListFilterBar
          query={query}
          kind={kind}
          mine={mine}
          hideDone={hideDone}
          onQuery={(query) => setFilter({ query })}
          onKind={(kind) => setFilter({ kind: kind as ProjectViewSearch["kind"] })}
          onMine={(mine) => setFilter({ mine })}
          onHideDone={(hideDone) => setFilter({ hideDone })}
        />
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        <ul>
          {rows.length === 0 ? <EmptyHint>没有符合筛选的事项</EmptyHint> : null}
          {rows.map((item) => {
            const sprint = sprints.find((entry) => entry.id === item.sprintId);
            return (
              <IssueRow
                key={item.id}
                item={item}
                assignee={people.find((person) => person.id === item.assigneeId)}
                onOpen={goToItem}
                extra={
                  <span className="type-caption hidden w-24 truncate md:inline">
                    {sprint?.name ?? "未排期"}
                  </span>
                }
              />
            );
          })}
        </ul>
      </div>
    </div>
  );
}
