import { Label, NumberField } from "@heroui/react";
import { useState } from "react";
import { toast } from "sonner";
import { DayField } from "@/components/biz/date-fields";
import { LabeledField } from "@/components/biz/labeled-field";
import { PersonSelect, PrioritySelect, SprintSelect, VersionSelect } from "@/components/biz/field-selects";
import { ProgressSlider } from "@/components/biz/progress-slider";
import { SeverityChip, StatusChip } from "@/components/biz/status-chip";
import { useGoToItem } from "@/components/pm/use-go-item";
import { DEPENDENCY_TYPE_LABEL, formatDay, fsBlockers, type Person, type ReleaseVersion, type Sprint, type WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

type Patch = Partial<Pick<WorkItem, "priority" | "assigneeId" | "sprintId" | "versionId" | "storyPoints" | "progress" | "dueDate" | "tags">>;

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
  const sprint = sprints.find((entry) => entry.id === item.sprintId);
  const planStart = item.planStart ?? sprint?.start;
  const planEnd = item.planEnd ?? sprint?.end;
  const reporter = people.find((person) => person.id === item.reporterId);
  const dependencies = usePm((state) => state.dependencies);
  const items = usePm((state) => state.items);
  const goToItem = useGoToItem();
  const related = dependencies.filter((entry) => entry.status === "ACTIVE" && (entry.predecessorId === item.id || entry.successorId === item.id));
  const blocked = new Set(fsBlockers(item, "IN_PROGRESS", items, dependencies).map((entry) => entry.id));
  const [tag, setTag] = useState("");
  const [hours, setHours] = useState("1");
  const [workDate, setWorkDate] = useState(localDay());
  const [note, setNote] = useState("");
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
      <div>
        <div className="type-label mb-1">计划日期</div>
        <p className="type-body">{planStart && planEnd ? `${formatDay(planStart)} 至 ${formatDay(planEnd)}` : "未排期"}</p>
        {planStart && planEnd && (!item.planStart || !item.planEnd) ? <p className="type-caption">未单独设置的日期沿用迭代起止。</p> : null}
      </div>
      <LabeledField label="到期日">
        <input
          type="date"
          aria-label="到期日"
          value={item.dueDate ?? ""}
          className="type-body h-10 w-full rounded-sm border border-border bg-surface px-2"
          onChange={(event) => onPatch({ dueDate: event.target.value })}
        />
      </LabeledField>
      <div>
        <div className="type-label mb-1">标签</div>
        <div className="flex flex-wrap gap-1">
          {item.tags.map((entry) => (
            <button key={entry} type="button" className="type-caption rounded-sm border border-border px-2 py-1" onClick={() => onPatch({ tags: item.tags.filter((tagName) => tagName !== entry) })}>
              {entry} ×
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = tag.trim();
            if (!next || item.tags.includes(next)) return;
            onPatch({ tags: [...item.tags, next] });
            setTag("");
          }}
        >
          <input aria-label="新标签" value={tag} onChange={(event) => setTag(event.target.value)} className="type-body h-9 min-w-0 flex-1 rounded-sm border border-border px-2" placeholder="添加标签" />
          <button type="submit" className="type-link px-1">添加</button>
        </form>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const amount = Number(hours);
          if (!Number.isFinite(amount) || amount <= 0 || amount > 24) {
            toast.error("工时要在 0 到 24 小时之间");
            return;
          }
          if (!workDate) {
            toast.error("请填写日期");
            return;
          }
          usePm.getState().addWorkLog({ projectId: item.projectId, itemId: item.id, hours: amount, workDate, note });
          setNote("");
          toast("已记下工时，待审批");
        }}
      >
        <div className="type-label">记一笔工时</div>
        <div className="flex gap-2">
          <input aria-label="小时" value={hours} onChange={(event) => setHours(event.target.value)} className="type-body h-9 w-16 rounded-sm border border-border px-2" />
          <div className="min-w-0 flex-1">
            <DayField label="工时日期" value={workDate} onChange={setWorkDate} />
          </div>
        </div>
        <input aria-label="工时说明" value={note} onChange={(event) => setNote(event.target.value)} placeholder="说明" className="type-body h-9 rounded-sm border border-border px-2" />
        <button type="submit" className="type-link self-start">记一笔</button>
      </form>
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

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
