import { Label, NumberField } from "@heroui/react";
import { LabeledField } from "@/components/biz/labeled-field";
import { PersonSelect, PrioritySelect, SprintSelect, VersionSelect } from "@/components/biz/field-selects";
import { ProgressSlider } from "@/components/biz/progress-slider";
import { SeverityChip, StatusChip } from "@/components/biz/status-chip";
import { useGoToItem } from "@/components/pm/use-go-item";
import { DEPENDENCY_TYPE_LABEL, fsBlockers, type Person, type ReleaseVersion, type Sprint, type WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

type Patch = Partial<Pick<WorkItem, "priority" | "assigneeId" | "sprintId" | "versionId" | "storyPoints" | "progress">>;

export function IssueProperties({
  item,
  people,
  sprints,
  versions,
  onPatch,
}: {
  item: WorkItem;
  people: Person[];
  sprints: Sprint[];
  versions: ReleaseVersion[];
  onPatch: (patch: Patch) => void;
}) {
  const reporter = people.find((person) => person.id === item.reporterId);
  const dependencies = usePm((state) => state.dependencies);
  const items = usePm((state) => state.items);
  const goToItem = useGoToItem();
  const related = dependencies.filter((entry) => entry.status === "ACTIVE" && (entry.predecessorId === item.id || entry.successorId === item.id));
  const blocked = new Set(fsBlockers(item, "IN_PROGRESS", items, dependencies).map((entry) => entry.id));
  return (
    <aside className="flex h-fit flex-col gap-4">
      <LabeledField label="负责人">
        <PersonSelect showRole people={people} value={item.assigneeId ?? ""} onChange={(assigneeId) => onPatch({ assigneeId: assigneeId || null })} />
      </LabeledField>
      <LabeledField label="优先级">
        <PrioritySelect value={item.priority} onChange={(priority) => onPatch({ priority })} />
      </LabeledField>
      <LabeledField label="迭代">
        <SprintSelect sprints={sprints} value={item.sprintId ?? ""} onChange={(sprintId) => onPatch({ sprintId: sprintId || null })} />
      </LabeledField>
      <LabeledField label="版本">
        <VersionSelect versions={versions} value={item.versionId ?? ""} onChange={(versionId) => onPatch({ versionId: versionId || null })} />
      </LabeledField>
      {item.kind === "defect" ? (
        <LabeledField label="严重程度">
          <SeverityChip severity={item.severity ?? ""} />
        </LabeledField>
      ) : (
        <NumberField
          aria-label="故事点"
          minValue={0}
          value={item.storyPoints ?? 0}
          onChange={(value) => onPatch({ storyPoints: Number.isFinite(value) ? value : 0 })}
        >
          <Label>故事点</Label>
          <NumberField.Group>
            <NumberField.DecrementButton />
            <NumberField.Input />
            <NumberField.IncrementButton />
          </NumberField.Group>
        </NumberField>
      )}
      {item.kind === "task" ? (
        <LabeledField label={`进度 ${item.progress}%`}>
          <ProgressSlider value={item.progress} onChange={(progress) => onPatch({ progress })} />
        </LabeledField>
      ) : null}
      {related.length > 0 ? (
        <div>
          <div className="type-label mb-1">依赖</div>
          <div className="flex flex-col gap-1">
            {related.map((entry) => {
              const predecessor = entry.predecessorId === item.id;
              const other = items.find((candidate) => candidate.id === (predecessor ? entry.successorId : entry.predecessorId));
              if (!other) return null;
              const blocking = !predecessor && blocked.has(other.id);
              return (
                <button key={entry.id} type="button" className="flex items-center gap-2 text-left" onClick={() => goToItem(other.id)}>
                  <span className={blocking ? "type-body text-danger" : "type-caption"}>{predecessor ? "后置" : "前置"}</span>
                  <span className="type-link">{other.key}</span>
                  <StatusChip kind={other.kind} status={other.status} />
                  <span className="type-caption">{DEPENDENCY_TYPE_LABEL[entry.dependencyType]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="type-caption">报告人 {reporter?.name ?? "未知"}</p>
    </aside>
  );
}
