import type { FeedEntry, Person } from "@/lib/pm/domain";
import { formatRelative } from "@/lib/pm/domain";
import { EmptyHint } from "@/components/biz/empty-hint";
import { PersonAvatar } from "@/components/biz/person-avatar";

export function FeedPreview({
  feeds,
  people,
  onOpen,
}: {
  feeds: FeedEntry[];
  people: Person[];
  onOpen: (itemId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-sm border border-border bg-surface">
      <header className="border-b border-border px-4 py-3">
        <h2 className="type-section">对象动态</h2>
      </header>
      <ul>
        {feeds.length === 0 ? <EmptyHint>还没有对象动态</EmptyHint> : null}
        {feeds.map((entry) => {
          const actor = people.find((person) => person.id === entry.actorId);
          return (
            <li key={entry.id}>
              <button type="button" className="flex w-full gap-2 px-4 py-3 text-left hover:bg-line" onClick={() => onOpen(entry.itemId)}>
                <PersonAvatar person={actor} />
                <span className="min-w-0">
                  <span className="type-body block">
                    <span className="type-emphasis">{actor?.name}</span>
                    <span className="type-meta"> {entry.text}</span>
                  </span>
                  <span className="type-caption">{formatRelative(entry.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
