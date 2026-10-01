import type { FeedEntry, ItemKind, LifecycleRecord, Person } from "@/lib/pm/domain";
import { formatRelative } from "@/lib/pm/domain";
import { StatusChip } from "@/components/biz/status-chip";

export function ActivityList({ feeds, people }: { feeds: FeedEntry[]; people: Person[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {feeds.length === 0 ? <li className="type-caption">还没有对象动态。</li> : null}
      {feeds.map((entry) => (
        <li key={entry.id} className="type-body">
          <span className="type-emphasis">{people.find((person) => person.id === entry.actorId)?.name}</span>
          <span className="type-meta"> {entry.text}</span>
          <div className="type-caption">{formatRelative(entry.createdAt)}</div>
        </li>
      ))}
    </ul>
  );
}

export function HistoryList({ histories, people, kind }: { histories: LifecycleRecord[]; people: Person[]; kind: ItemKind }) {
  return (
    <ul className="mt-3 flex flex-col gap-3">
      {histories.length === 0 ? <li className="type-caption">还没有成功的状态流转。</li> : null}
      {histories.map((entry) => (
        <li key={entry.id} className="type-body rounded-sm bg-line px-3 py-2">
          <div>
            {people.find((person) => person.id === entry.actorId)?.name} · {entry.transitionName}
          </div>
          <div className="type-caption mt-1 flex flex-wrap items-center gap-1">
            <StatusChip kind={kind} status={entry.fromStatus} />
            <span>→</span>
            <StatusChip kind={kind} status={entry.toStatus} />
            {entry.reason ? <span>· {entry.reason}</span> : null}
          </div>
          <div className="type-caption">{formatRelative(entry.createdAt)}</div>
        </li>
      ))}
    </ul>
  );
}
