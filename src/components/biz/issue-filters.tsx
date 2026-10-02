import { useEffect, useRef, useState } from "react";
import type { ItemKind, Person, Sprint } from "@/lib/pm/domain";
import { FilterCheckbox } from "@/components/biz/filter-checkbox";
import { KindSelect, SprintSelect } from "@/components/biz/field-selects";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { QueryField } from "@/components/biz/query-field";
import { cn } from "@/lib/utils";

export function BoardFilterBar({
  sprints,
  people,
  tags,
  query,
  sprintId,
  kind,
  mine,
  showCancelled,
  assigneeIds,
  tag,
  onQuery,
  onSprint,
  onKind,
  onMine,
  onCancelled,
  onAssignees,
  onTag,
  hideKind = false,
  hideSprint = false,
}: {
  sprints: Sprint[];
  people: Person[];
  tags: string[];
  query: string;
  sprintId: string;
  kind: "all" | ItemKind;
  mine: boolean;
  showCancelled: boolean;
  assigneeIds: string[];
  tag: string;
  onQuery: (value: string) => void;
  onSprint: (id: string) => void;
  onKind: (kind: "all" | ItemKind) => void;
  onMine: (next: boolean) => void;
  onCancelled: (next: boolean) => void;
  onAssignees: (ids: string[]) => void;
  onTag: (tag: string) => void;
  hideKind?: boolean;
  hideSprint?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const extra = assigneeIds.length + (tag ? 1 : 0) + (showCancelled ? 1 : 0);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const restoreFocus = panel.current?.contains(document.activeElement);
        setOpen(false);
        if (restoreFocus) panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const togglePerson = (id: string) => {
    onAssignees(assigneeIds.includes(id) ? assigneeIds.filter((entry) => entry !== id) : [...assigneeIds, id]);
  };
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="flex min-w-0 basis-full flex-wrap items-center gap-2 lg:flex-1 lg:basis-auto">
        <div className="w-40 shrink-0">
          <QueryField label="搜索" value={query} onChange={onQuery} />
        </div>
        {hideSprint ? null : (
          <div className="w-40 shrink-0">
            <SprintSelect label="迭代" sprints={sprints} value={sprintId} allowEmpty={sprints.length === 0} emptyLabel="没有迭代" onChange={onSprint} />
          </div>
        )}
        {hideKind ? null : (
          <div className="w-40 shrink-0">
            <KindSelect allowAll value={kind} onChange={(next) => onKind(next as "all" | ItemKind)} />
          </div>
        )}
        <div className="shrink-0">
          <FilterCheckbox label="只看我的" checked={mine} onChange={onMine} />
        </div>
        {assigneeIds.map((id) => (
          <FilterChip key={id} label={people.find((person) => person.id === id)?.name ?? "未分配"} onClear={() => togglePerson(id)} />
        ))}
        {tag ? <FilterChip label={tag} onClear={() => onTag("")} /> : null}
        {showCancelled ? <FilterChip label="含已取消" onClear={() => onCancelled(false)} /> : null}
      </div>
      <div className="relative shrink-0" ref={panel}>
        <button
          type="button"
          aria-expanded={open}
          className={cn("type-body h-10 rounded-sm border px-3", open || extra > 0 ? "border-primary text-primary" : "border-border")}
          onClick={() => setOpen((value) => !value)}
        >
          筛选{extra > 0 ? ` ${extra}` : ""}
        </button>
        {open ? (
          <div className="pm-board-filter-panel fixed top-16 left-20 z-30 w-72 max-w-[calc(100vw-6rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-sm border border-border bg-surface p-3 shadow-pop lg:absolute lg:top-auto lg:right-0 lg:left-auto lg:mt-1">
            <div className="type-label">负责人</div>
            <div className="mt-2 flex flex-col gap-1">
              {people.length === 0 ? <p className="type-caption">没有成员</p> : null}
              {people.map((person) => {
                const selected = assigneeIds.includes(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    aria-pressed={selected}
                    className={cn("flex items-center gap-2 rounded-sm px-2 py-1.5 text-left", selected && "bg-primary-soft")}
                    onClick={() => togglePerson(person.id)}
                  >
                    <PersonAvatar person={person} />
                    <span className="type-body truncate">{person.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="type-label mt-3">标签</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? <p className="type-caption">没有标签</p> : null}
              {tags.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={tag === entry}
                  className={cn("type-caption rounded-sm border px-2 py-1", tag === entry ? "border-primary text-primary" : "border-border")}
                  onClick={() => onTag(tag === entry ? "" : entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <FilterCheckbox label="含已取消" checked={showCancelled} onChange={onCancelled} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" aria-label={`清除${label}`} className="type-caption inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border border-border bg-surface px-2" onClick={onClear}>
      {label}
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function ListFilterBar({
  query,
  kind,
  mine,
  hideDone,
  onQuery,
  onKind,
  onMine,
  onHideDone,
}: {
  query: string;
  kind: string;
  mine: boolean;
  hideDone: boolean;
  onQuery: (value: string) => void;
  onKind: (kind: string) => void;
  onMine: (next: boolean) => void;
  onHideDone: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-40">
        <QueryField label="搜索" value={query} onChange={onQuery} />
      </div>
      <div className="w-40">
        <KindSelect allowAll value={kind} onChange={onKind} />
      </div>
      <FilterCheckbox label="只看我的" checked={mine} onChange={onMine} />
      <FilterCheckbox label="隐藏完成" checked={hideDone} onChange={onHideDone} />
    </div>
  );
}
