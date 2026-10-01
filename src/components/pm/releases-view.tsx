import { useMemo } from "react";
import { formatDay, VERSION_STATUS_LABEL, versionEvent } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { useGoToItem } from "@/components/pm/use-go-item";
import { StatusPill } from "@/components/pm/bits";

export function ReleasesView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allVersions = usePm((state) => state.versions);
  const allItems = usePm((state) => state.items);
  const versions = useMemo(() => allVersions.filter((entry) => entry.projectId === project?.id), [allVersions, project?.id]);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === project?.id), [allItems, project?.id]);
  const goToItem = useGoToItem();

  if (!project) return <div className="p-8 text-sm text-muted">没有找到这个项目。</div>;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold">版本</h1>
        <p className="text-sm text-muted">流转沿用版本事件：开始开发、开始测试、冻结、退回。冻结后范围仍可查看，改范围要先重新测试。</p>
      </div>
      {versions.map((version) => {
        const scope = items.filter((item) => item.versionId === version.id);
        const events = versionEvent(version.status);
        const locked = version.status === "FROZEN" || version.status === "RELEASED" || version.status === "DEPRECATED";
        return (
          <article key={version.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">
                    {version.versionNumber} {version.name}
                  </h2>
                  <span className="rounded-sm bg-line px-1.5 py-0.5 text-xs text-muted">{VERSION_STATUS_LABEL[version.status]}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{version.description}</p>
                <p className="mt-1 text-xs text-faint">
                  {version.versionType} · 计划 {formatDay(version.plannedReleaseDate)}
                  {locked ? " · 范围已锁定" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {events.map((event) => (
                  <button
                    key={event.event}
                    type="button"
                    className="h-8 rounded-md border border-border px-3 text-xs font-medium hover:bg-line"
                    onClick={() => usePm.getState().transitionVersion(version.id, event.to)}
                  >
                    {event.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="mt-4 divide-y divide-line rounded-md border border-border">
              {scope.length === 0 ? <li className="px-3 py-3 text-sm text-faint">这个版本还没有纳入事项</li> : null}
              {scope.map((item) => (
                <li key={item.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-line" onClick={() => goToItem(item.id)}>
                    <span className="w-16 shrink-0 font-medium text-primary-ink">{item.key}</span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <StatusPill kind={item.kind} status={item.status} />
                  </button>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
