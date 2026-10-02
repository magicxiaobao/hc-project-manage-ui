import { Button } from "@heroui/react";
import { useMemo, useState, type ReactNode } from "react";
import { EmptyHint, IssueTypeIcon, OptionSelect, PageHeading, StateChip, StatusChip, VersionStatusChip } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { TEST_CASE_STATUS_LABEL, TEST_RESULT_LABEL, type TestResult, type WorkItem } from "@/lib/pm/domain";
import { openDefects, traceGaps, traceRequirement, evidenceMatrix, type RequirementTrace, type TraceGap } from "@/lib/pm/trace";
import { usePm } from "@/lib/pm/store";
import { cn } from "@/lib/utils";
import type { StateTone } from "@/components/biz/state-tone";

const GAP_TONE: Record<TraceGap, StateTone> = {
  无用例: "neutral",
  有失败: "danger",
  未关缺陷: "review",
};

const RESULT_TONE: Record<TestResult, StateTone> = {
  PASSED: "done",
  FAILED: "danger",
  BLOCKED: "review",
  SKIPPED: "neutral",
};

// View-only memory keeps the selected source visible when returning from an item.
// It lasts for this SPA session and never enters PM persistence.
const selectedObjects = new Map<string, string>();

export function TraceView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const items = usePm((state) => state.items);
  const cases = usePm((state) => state.testCases);
  const runs = usePm((state) => state.testRuns);
  const executions = usePm((state) => state.testExecutions);
  const versions = usePm((state) => state.versions);
  const histories = usePm((state) => state.histories);
  const people = usePm((state) => state.people);
  const goToItem = useGoToItem();
  const [selectedId, setChoice] = useState<string | null>(() => selectedObjects.get(projectKey) ?? null);
  const setSelectedId = (id: string) => { selectedObjects.set(projectKey, id); setChoice(id); };

  const requirements = useMemo(
    () => items.filter((item) => item.projectId === project?.id && item.kind === "requirement").sort((a, b) => a.key.localeCompare(b.key)),
    [items, project?.id],
  );
  const traces = useMemo(
    () => requirements.map((requirement) => traceRequirement(requirement, items, cases, runs, executions, versions)),
    [requirements, items, cases, runs, executions, versions],
  );
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const selected = traces.find((entry) => entry.requirement.id === (selectedId ?? requirements[0]?.id)) ?? null;
  const missingCases = traces.filter((entry) => traceGaps(entry).includes("无用例")).length;
  const failed = traces.filter((entry) => traceGaps(entry).includes("有失败")).length;
  const open = traces.filter((entry) => traceGaps(entry).includes("未关缺陷")).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="需求追溯" hint="先选择需求，查看它的任务、用例、执行、缺陷和版本。" />
      {traces.length === 0 ? <EmptyHint>这个项目还没有需求。</EmptyHint> : <OptionSelect label="当前需求" value={selected?.requirement.id ?? ""} options={requirements.map((item) => ({ id: item.id, label: `${item.key} ${item.title}` }))} onChange={setSelectedId} />}
      {selected ? <TraceDetail trace={selected} histories={histories} people={people} items={items} onOpen={goToItem} /> : null}
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">项目追溯概览 · {traces.length} 条需求</summary>
<div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="无用例" value={missingCases} />
        <Stat label="有失败" value={failed} />
        <Stat label="未关缺陷" value={open} />
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {traces.length === 0 ? <EmptyHint>这个项目还没有需求。</EmptyHint> : null}
        {traces.map((trace) => {
          const gaps = traceGaps(trace);
          const active = trace.requirement.id === selected?.requirement.id;
          return (
            <button
              key={trace.requirement.id}
              aria-pressed={active}
              type="button"
              className={cn("flex w-full flex-col gap-2 border-b border-border px-3 py-3 text-left last:border-b-0", active && "bg-line")}
              onClick={() => setSelectedId(trace.requirement.id)}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <IssueTypeIcon item={trace.requirement} />
                <span className="type-link shrink-0">{trace.requirement.key}</span>
                <span className="type-body min-w-0 flex-1 truncate">{trace.requirement.title}</span>
                <StatusChip kind="requirement" status={trace.requirement.status} />
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="type-caption">
                  任务 {trace.tasks.length} · 用例 {trace.cases.length} · 未关缺陷 {openDefects(trace).length}
                </span>
                {gaps.length === 0 ? <StateChip tone="done">已覆盖</StateChip> : gaps.map((gap) => <StateChip key={gap} tone={GAP_TONE[gap]}>{gap}</StateChip>)}
              </span>
            </button>
          );
        })}
      </div>

</div>
</details>

    </div>
  );
}

function TraceDetail({ trace, histories, people, items, onOpen }: { trace: RequirementTrace; histories: { id: string; itemId: string; fromStatus: string; toStatus: string; transitionName: string; actorId: string; reason: string | null; createdAt: string }[]; people: { id: string; name: string }[]; items: WorkItem[]; onOpen: (id: string) => void }) {
  const related = [trace.requirement, ...trace.children, ...trace.tasks, ...trace.defects];
  const ids = new Set(related.map((item) => item.id));
  const events = histories.filter((entry) => ids.has(entry.itemId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const matrix = evidenceMatrix(trace, items);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-section">
          {trace.requirement.key} {trace.requirement.title}
        </h2>
        <Button variant="outline" onPress={() => exportTrace(trace, items)}>
          导出
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Bucket title="子需求" empty="没有下级需求。">
          {trace.children.map((item) => (
            <ItemLine key={item.id} item={item} onOpen={onOpen} />
          ))}
        </Bucket>
        <Bucket title="任务" empty="没有拆出去的任务。">
          {trace.tasks.map((item) => (
            <ItemLine key={item.id} item={item} onOpen={onOpen} />
          ))}
        </Bucket>
        <Bucket title="用例" empty="还没有用例挂到这条需求或其任务上。">
          {trace.cases.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <span className="type-link shrink-0">{entry.key}</span>
              <span className="type-body min-w-0 flex-1 truncate">{entry.title}</span>
              <StateChip tone={entry.status === "ACTIVE" ? "done" : entry.status === "REVIEW" ? "review" : "neutral"}>{TEST_CASE_STATUS_LABEL[entry.status]}</StateChip>
            </div>
          ))}
        </Bucket>
        <Bucket title="执行" empty="这些用例还没有进入测试运行。">
          {trace.executions.map(({ execution, testCase, run }) => (
            <div key={execution.id} className="flex items-center gap-2">
              <span className="type-link shrink-0">{testCase.key}</span>
              <span className="type-caption min-w-0 flex-1 truncate">{run?.name ?? "未知运行"}</span>
              {execution.result ? <StateChip tone={RESULT_TONE[execution.result]}>{TEST_RESULT_LABEL[execution.result]}</StateChip> : <StateChip tone="neutral">未测</StateChip>}
            </div>
          ))}
        </Bucket>
        <Bucket title="缺陷" empty="没有挂到这条需求上的缺陷。">
          {trace.defects.map((item) => (
            <ItemLine key={item.id} item={item} onOpen={onOpen} />
          ))}
        </Bucket>
        <Bucket title="版本" empty="需求和它的下级都还没进版本。">
          {trace.versions.map((version) => (
            <div key={version.id} className="flex items-center gap-2">
              <span className="type-link">{version.versionNumber}</span>
              <span className="type-body min-w-0 flex-1 truncate">{version.name}</span>
              <VersionStatusChip status={version.status} />
            </div>
          ))}
        </Bucket>
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="type-section">影响范围</h3>
        <p className="type-body">改 {trace.requirement.key} 会碰到 {trace.tasks.length} 个任务、{trace.cases.length} 条用例、{trace.defects.length} 个缺陷、{trace.versions.length} 个版本。</p>
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {[...trace.tasks.map((item) => `任务 ${item.key} ${item.title}`), ...trace.cases.map((entry) => `用例 ${entry.key} ${entry.title}`), ...trace.defects.map((item) => `缺陷 ${item.key} ${item.title}`), ...trace.versions.map((version) => `版本 ${version.versionNumber} ${version.name}`)].map((line) => (
            <p key={line} className="type-body border-b border-border px-3 py-2 last:border-b-0">{line}</p>
          ))}
          {trace.tasks.length + trace.cases.length + trace.defects.length + trace.versions.length === 0 ? <p className="type-caption px-3 py-2">这条需求还没有带出任务、用例、缺陷或版本。</p> : null}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="type-section">证据矩阵</h3>
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {matrix.length === 0 ? <p className="type-caption px-3 py-2">还没有挂上用例。</p> : null}
          {matrix.map((row) => (
            <div key={row.testCase.id} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="type-link">{row.testCase.key}</span>
              <span className="type-body min-w-0 flex-1 truncate">{row.testCase.title}</span>
              {row.result ? <StateChip tone={RESULT_TONE[row.result]}>{TEST_RESULT_LABEL[row.result]}</StateChip> : <StateChip tone="neutral">未测</StateChip>}
              {row.defect ? <button type="button" className="type-link" onClick={() => onOpen(row.defect!.id)}>{row.defect.key}</button> : <span className="type-caption">无缺陷</span>}
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="type-section">关系</h3>
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {relationLines(trace).map((line) => (
            <p key={line} className="type-body border-b border-border px-3 py-2 last:border-b-0">
              {line}
            </p>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="type-section">流转历史</h3>
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {events.length === 0 ? <p className="type-meta px-3 py-2">这条需求及其拆出的事项还没有流转记录。</p> : null}
          {events.map((event) => {
            const item = related.find((entry) => entry.id === event.itemId);
            const actor = people.find((person) => person.id === event.actorId);
            return (
              <p key={event.id} className="type-body border-b border-border px-3 py-2 last:border-b-0">
                {item?.key ?? "事项"} {event.transitionName}
                {event.reason ? `：${event.reason}` : ""}
                <span className="type-caption"> · {actor?.name ?? "有人"}</span>
              </p>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function exportTrace(trace: RequirementTrace, items: WorkItem[]) {
  const lines = ["关系,对象,标题"];
  const push = (relation: string, key: string, title: string) => lines.push([relation, key, title].map((value) => `"${value.replaceAll("\"", "\"\"")}"`).join(","));
  for (const item of trace.children) push("子需求", item.key, item.title);
  for (const item of trace.tasks) push("任务", item.key, item.title);
  for (const entry of trace.cases) push("用例", entry.key, entry.title);
  for (const item of trace.defects) push("缺陷", item.key, item.title);
  for (const version of trace.versions) push("版本", version.versionNumber, version.name);
  for (const run of trace.runs) push("运行", run.name, run.status);
  for (const item of trace.tasks) push("影响-任务", item.key, item.title);
  for (const entry of trace.cases) push("影响-用例", entry.key, entry.title);
  for (const item of trace.defects) push("影响-缺陷", item.key, item.title);
  for (const row of evidenceMatrix(trace, items)) {
    push("证据", row.testCase.key, `${row.result ?? "未测"} ${row.defect?.key ?? ""}`.trim());
  }
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${trace.requirement.key}-追溯.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function relationLines(trace: RequirementTrace) {
  const source = trace.requirement.key;
  const lines = [
    ...trace.children.map((item) => `${source} 包含 ${item.key} · 直接`),
    ...trace.tasks.map((item) => `${source} 拆出 ${item.key} · 直接`),
    ...trace.defects.map((item) => `${source} 发现 ${item.key} · 直接`),
    ...trace.cases.map((entry) => `${source} 关联 ${entry.key} · 直接`),
    ...trace.versions.map((version) => `${source} 纳入 ${version.versionNumber} · 直接`),
    ...trace.runs.map((run) => {
      const cases = trace.executions.filter((entry) => entry.run?.id === run.id).map((entry) => entry.testCase.key);
      return `${cases.join("、")} 执行于 ${run.name} · 派生`;
    }),
  ];
  return lines.length > 0 ? lines : ["这条需求还没有可追溯的关系。"];
}

function Bucket({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const list = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="rounded-sm border border-border bg-surface p-3">
      <h3 className="type-section mb-2">{title}</h3>
      {list.length === 0 ? <p className="type-caption">{empty}</p> : <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

function ItemLine({ item, onOpen }: { item: WorkItem; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="flex flex-wrap items-center gap-2 text-left" onClick={() => onOpen(item.id)}>
      <IssueTypeIcon item={item} />
      <span className="type-link shrink-0">{item.key}</span>
      <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
      <StatusChip kind={item.kind} status={item.status} />
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-4 py-3">
      <div className="type-caption">{label}</div>
      <div className="type-section mt-1">{value}</div>
    </div>
  );
}
