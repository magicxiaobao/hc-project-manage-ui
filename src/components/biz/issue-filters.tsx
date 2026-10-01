import type { ItemKind, Person, Sprint } from "@/lib/pm/domain";
import { FilterCheckbox } from "@/components/biz/filter-checkbox";
import { KindSelect, SprintSelect } from "@/components/biz/field-selects";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { QueryField } from "@/components/biz/query-field";

export function BoardFilterBar({
  sprints,
  sprintId,
  kind,
  mine,
  showCancelled,
  me,
  onSprint,
  onKind,
  onMine,
  onCancelled,
  hideKind = false,
}: {
  sprints: Sprint[];
  sprintId: string;
  kind: "all" | ItemKind;
  mine: boolean;
  showCancelled: boolean;
  me?: Person;
  onSprint: (id: string) => void;
  onKind: (kind: "all" | ItemKind) => void;
  onMine: (next: boolean) => void;
  onCancelled: (next: boolean) => void;
  hideKind?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-48">
        <SprintSelect label="迭代" sprints={sprints} value={sprintId} allowEmpty={sprints.length === 0} emptyLabel="没有迭代" onChange={onSprint} />
      </div>
      {hideKind ? null : (
        <div className="w-36">
          <KindSelect allowAll value={kind} onChange={(next) => onKind(next as "all" | ItemKind)} />
        </div>
      )}
      <FilterCheckbox label="只看我的" checked={mine} onChange={onMine} />
      <FilterCheckbox label="含已取消" checked={showCancelled} onChange={onCancelled} />
      <PersonAvatar person={me} size="md" />
    </div>
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-48">
        <QueryField label="搜索" value={query} onChange={onQuery} />
      </div>
      <div className="w-36">
        <KindSelect allowAll value={kind} onChange={onKind} />
      </div>
      <FilterCheckbox label="只看我的" checked={mine} onChange={onMine} />
      <FilterCheckbox label="隐藏完成" checked={hideDone} onChange={onHideDone} />
    </div>
  );
}
