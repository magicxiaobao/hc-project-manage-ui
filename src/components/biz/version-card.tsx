import type { Person, ReleaseVersion, VersionStatus, WorkItem } from "@/lib/pm/domain";
import { formatDay, versionEvent } from "@/lib/pm/domain";
import { DayField, type CalendarMark } from "@/components/biz/date-fields";
import { EmptyHint } from "@/components/biz/empty-hint";
import { IssueRow } from "@/components/biz/issue-row";
import { StateAction } from "@/components/biz/state-action";
import { versionEventTone } from "@/components/biz/state-tone";
import { VersionStatusChip } from "@/components/biz/status-chip";

export function VersionCard({
  version,
  items,
  people,
  onOpen,
  onTransition,
  onDate,
  dateMarks = [],
}: {
  version: ReleaseVersion;
  items: WorkItem[];
  people: Person[];
  onOpen: (id: string) => void;
  onTransition: (to: VersionStatus) => void;
  onDate: (iso: string) => void;
  dateMarks?: CalendarMark[];
}) {
  const events = versionEvent(version.status);
  const locked = version.status === "FROZEN" || version.status === "RELEASED" || version.status === "DEPRECATED";
  return (
    <article className="rounded-sm border border-border bg-surface p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="type-section">
              {version.versionNumber} {version.name}
            </h2>
            <VersionStatusChip status={version.status} />
          </div>
          <p className="type-meta mt-1">{version.description}</p>
          <p className="type-caption mt-1">
            {version.versionType}
            {locked ? ` · 计划 ${formatDay(version.plannedReleaseDate)} · 范围已锁定` : ""}
          </p>
          {locked ? null : (
            <div className="mt-2 max-w-xs">
              <DayField label="计划发布" value={version.plannedReleaseDate} marks={dateMarks} onChange={onDate} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {events.map((event) => (
            <StateAction key={event.event} tone={versionEventTone(event.event)} onPress={() => onTransition(event.to)}>
              {event.label}
            </StateAction>
          ))}
        </div>
      </div>
      <ul className="mt-4 overflow-hidden rounded-sm border border-border">
        {items.length === 0 ? <EmptyHint>这个版本还没有纳入事项</EmptyHint> : null}
        {items.map((item) => (
          <IssueRow key={item.id} item={item} assignee={people.find((person) => person.id === item.assigneeId)} onOpen={onOpen} />
        ))}
      </ul>
    </article>
  );
}
