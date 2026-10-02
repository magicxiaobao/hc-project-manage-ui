import { notifyPmChange } from "@/lib/pm/feedback";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppModal, EmptyHint, LabeledField, OptionSelect, PageHeading, PersonAvatar, PriorityMark, StateAction, StateChip, VersionSelect } from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import { useGoToItem } from "@/components/pm/use-go-item";
import { TEST_CASE_STATUS_LABEL, TEST_RESULT_LABEL, TEST_RUN_STATUS_LABEL, type TestExecution, type TestResult, type TestRun, type TestRunStatus } from "@/lib/pm/domain";
import { cn } from "@/lib/utils";
import { usePm } from "@/lib/pm/store";

const RESULT_TONE: Record<TestResult, StateTone> = {
  PASSED: "done",
  FAILED: "danger",
  BLOCKED: "review",
  SKIPPED: "neutral",
};

const ENVIRONMENTS = ["测试环境", "预发", "生产"];
const CREATE_TYPES = ["全量回归", "临时抽测"];

function runTone(status: TestRunStatus): StateTone {
  if (status === "RUNNING") return "progress";
  if (status === "COMPLETED") return "done";
  if (status === "CANCELLED") return "revert";
  return "neutral";
}

function verdict(run: TestRun, rows: TestExecution[]) {
  const failed = rows.filter((entry) => entry.result === "FAILED" || entry.result === "BLOCKED").length;
  const open = rows.filter((entry) => !entry.result).length;
  if (run.status === "CANCELLED") return run.cancelReason ? `已取消：${run.cancelReason}` : "已取消。";
  if (run.status === "CREATED") return "还没开始。开始后才能记结果。";
  if (open > 0) return `还有 ${open} 条未测，不能完成。`;
  if (failed > 0) return run.status === "COMPLETED" ? "已完成，仍有失败或阻塞。" : "结果已齐，仍有失败或阻塞。完成后可以对失败项做定向复测。";
  return run.status === "COMPLETED" ? "已完成，没有失败或阻塞。" : "结果已齐，没有失败或阻塞。";
}

// View-only memory keeps the selected source visible when returning from an item.
// It lasts for this SPA session and never enters PM persistence.
const selectedObjects = new Map<string, string>();

const expandedPanels = new Map<string, Set<string>>();

export function TestsView({ projectKey }: { projectKey: string }) {
  return <ProjectTestsView key={projectKey} projectKey={projectKey} />;
}

function ProjectTestsView({ projectKey }: { projectKey: string }) {
  const panelRoot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = panelRoot.current;
    const remember = (event: Event) => {
      const panel = event.target;
      if (!(panel instanceof HTMLDetailsElement)) return;
      const label = panel.querySelector("summary")?.textContent?.split(" · ")[0].trim() ?? "";
      const expanded = expandedPanels.get(projectKey) ?? new Set<string>();
      if (panel.open) expanded.add(label); else expanded.delete(label);
      expandedPanels.set(projectKey, expanded);
    };
    const expanded = expandedPanels.get(projectKey);
    for (const panel of root?.querySelectorAll("details") ?? []) {
      const label = panel.querySelector("summary")?.textContent?.split(" · ")[0].trim() ?? "";
      panel.open = expanded?.has(label) ?? false;
    }
    root?.addEventListener("toggle", remember, true);
    return () => root?.removeEventListener("toggle", remember, true);
  }, [projectKey]);
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const cases = usePm((state) => state.testCases);
  const runs = usePm((state) => state.testRuns);
  const executions = usePm((state) => state.testExecutions);
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);
  const versions = usePm((state) => state.versions);
  const projectRuns = useMemo(() => runs.filter((run) => run.projectId === project?.id), [runs, project?.id]);
  const projectCases = useMemo(() => cases.filter((entry) => entry.projectId === project?.id), [cases, project?.id]);
  const projectVersions = useMemo(() => versions.filter((entry) => entry.projectId === project?.id), [versions, project?.id]);
  const [runId, setChoice] = useState<string | null>(() =>
    projectRuns.find((run) => run.id === selectedObjects.get(projectKey))?.id ??
    projectRuns.find((run) => run.status === "RUNNING")?.id ?? projectRuns[0]?.id ?? null,
  );
  const setRunId = (id: string) => { selectedObjects.set(projectKey, id); setChoice(id); };
  const [name, setName] = useState("");
  const [runType, setRunType] = useState("全量回归");
  const [environment, setEnvironment] = useState("测试环境");
  const [versionId, setVersionId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [suiteName, setSuiteName] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [joinCase, setJoinCase] = useState<Record<string, string>>({});
  const suiteRecords = usePm((state) => state.suites);
  const goToItem = useGoToItem();
  const activeRun = projectRuns.find((run) => run.id === runId) ??
    projectRuns.find((run) => run.status === "RUNNING") ?? projectRuns[0] ?? null;
  const activeRunId = activeRun?.id ?? null;
  useLayoutEffect(() => {
    // Pin the identity when data first arrives or the selected object disappears.
    // Status changes on an existing run must keep its report/retest context.
    if (activeRunId) selectedObjects.set(projectKey, activeRunId);
    else selectedObjects.delete(projectKey);
    if (runId !== activeRunId) setChoice(activeRunId);
    setCancelling(false);
    setCancelReason("");
  }, [activeRunId, projectKey, runId]);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;
  const rows = executions.filter((execution) => execution.runId === activeRun?.id);
  const version = versions.find((entry) => entry.id === activeRun?.versionId);
  const source = runs.find((entry) => entry.id === activeRun?.sourceRunId);
  const suites = [...new Set([...suiteRecords.filter((entry) => entry.projectId === project.id).map((entry) => entry.name), ...projectCases.map((entry) => entry.suite)])];
  const activeCases = projectCases.filter((entry) => entry.status === "ACTIVE");
  const pickable = projectCases.filter((entry) => entry.status !== "ARCHIVED");
  const count = (result: TestResult | null) => rows.filter((entry) => entry.result === result).length;
  const runningCount = projectRuns.filter((run) => run.status === "RUNNING").length;
  const defectGap = executions.filter((execution) => {
    const run = projectRuns.find((entry) => entry.id === execution.runId);
    return run && run.status !== "CANCELLED" && (execution.result === "FAILED" || execution.result === "BLOCKED") && !execution.defectId;
  }).length;
  const failedRows = rows.filter((entry) => entry.result === "FAILED" || entry.result === "BLOCKED");
  const frozen = activeRun?.report;
  const passed = frozen?.passed ?? count("PASSED");
  const skipped = frozen?.skipped ?? count("SKIPPED");
  const reportedTotal = frozen?.total ?? rows.length;
  const rate = reportedTotal ? Math.round((passed / reportedTotal) * 100) : 0;

  const apply = (result: { ok: true } | { ok: false; message: string }, done?: () => void) => {
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    done?.();
  };

  return (
    <div ref={panelRoot} className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="测试" hint="先执行当前运行。新建运行和管理用例可按需展开。" />
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">切换运行 · {projectRuns.length} 次</summary>
<div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="运行" value={projectRuns.length} />
        <Stat label="执行中" value={runningCount} />
        <Stat label="待建缺陷" value={defectGap} />
      </div>
      {projectRuns.length === 0 ? <EmptyHint>这个项目还没有测试运行。</EmptyHint> : null}
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {projectRuns.map((run) => {
          const runRows = executions.filter((entry) => entry.runId === run.id);
          const done = runRows.filter((entry) => entry.result).length;
          const runVersion = versions.find((entry) => entry.id === run.versionId);
          const selected = run.id === activeRun?.id;
          return (
            <button
              key={run.id}
              aria-pressed={selected}
              type="button"
              className={cn("flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left last:border-b-0", selected && "bg-line")}
              onClick={() => {
                if (run.id !== activeRun?.id) setRunId(run.id);
              }}
            >
              <span className="flex items-center gap-2">
                <span className="type-emphasis min-w-0 flex-1 truncate">{run.name}</span>
                <StateChip tone={runTone(run.status)}>{TEST_RUN_STATUS_LABEL[run.status]}</StateChip>
              </span>
              <span className="type-caption">
                {run.runType} · {run.environment}
                {runVersion ? ` · ${runVersion.versionNumber}` : ""} · {done}/{runRows.length}
              </span>
            </button>
          );
        })}
      </div>

</div>
</details>
      {!activeRun ? <EmptyHint>还没有测试运行，可展开新建运行开始。</EmptyHint> : null}
      {activeRun ? (
        <>
          <div className="flex flex-wrap items-center gap-2"><h2 className="type-section">当前运行 · {activeRun.name}</h2><StateChip tone={runTone(activeRun.status)}>{TEST_RUN_STATUS_LABEL[activeRun.status]}</StateChip></div>
          <div className="flex flex-col gap-2">
            <p className="type-meta">
              {activeRun.runType} · {activeRun.environment}
              {version ? ` · ${version.versionNumber}` : ""}
              {source ? ` · 来自 ${source.name}` : ""}
            </p>
            <div className="flex flex-wrap gap-1">
              {activeRun.status === "CREATED" ? (
                <StateAction tone="progress" onPress={() => apply(usePm.getState().startRun(activeRun.id))}>
                  开始
                </StateAction>
              ) : null}
              {activeRun.status === "RUNNING" ? (
                <StateAction tone="done" onPress={() => apply(usePm.getState().completeRun(activeRun.id))}>
                  完成
                </StateAction>
              ) : null}
              {activeRun.status === "CREATED" || activeRun.status === "RUNNING" ? (
                <StateAction tone="revert" onPress={() => setCancelling((value) => !value)}>
                  取消
                </StateAction>
              ) : null}
              {activeRun.status === "COMPLETED" && failedRows.length > 0 ? (
                <StateAction
                  tone="review"
                  onPress={() => {
                    const result = usePm.getState().createRun({
                      projectId: project.id,
                      name: `${activeRun.name} 定向复测`.slice(0, 40),
                      runType: "定向复测",
                      environment: activeRun.environment,
                      versionId: activeRun.versionId,
                      caseIds: failedRows.map((entry) => entry.caseId),
                      sourceRunId: activeRun.id,
                    });
                    apply(result, () => {
                      if (result.ok) {
                        setRunId(result.id);
                        notifyPmChange("已创建定向复测");
                      }
                    });
                  }}
                >
                  定向复测
                </StateAction>
              ) : null}
            </div>
            {cancelling ? (
              <form
                className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  apply(usePm.getState().cancelRun(activeRun.id, cancelReason), () => {
                    setCancelling(false);
                    setCancelReason("");
                  });
                }}
              >
                <TextField className="min-w-0 flex-1" value={cancelReason} onChange={setCancelReason}>
                  <Label>取消原因</Label>
                  <Input placeholder="为什么取消这次运行" />
                </TextField>
                <Button type="submit" variant="danger">
                  确认取消
                </Button>
              </form>
            ) : null}
          </div>
          <p className="type-caption">通过 {count("PASSED")} · 失败 {count("FAILED")} · 阻塞 {count("BLOCKED")} · 未测 {count(null)}</p>
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {rows.map((execution) => {
              const testCase = cases.find((entry) => entry.id === execution.caseId);
              if (!testCase) return null;
              const requirement = items.find((item) => item.id === testCase.requirementId);
              const assignee = people.find((person) => person.id === testCase.assigneeId);
              const defect = items.find((item) => item.id === execution.defectId);
              const locked = activeRun.status !== "RUNNING";
              return (
                <div key={execution.id} className="flex flex-col gap-2 border-b border-border px-3 py-3 last:border-b-0 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="type-key shrink-0 whitespace-nowrap">{testCase.key}</span>
                      <span className="type-body min-w-0 break-words line-clamp-2">{testCase.title}</span>
                      <PriorityMark priority={testCase.priority} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StateChip tone={testCase.status === "ACTIVE" ? "done" : testCase.status === "REVIEW" ? "review" : "neutral"}>{TEST_CASE_STATUS_LABEL[testCase.status]}</StateChip>
                      <span className="type-caption">
                        {testCase.testType} · {testCase.suite}
                      </span>
                      {requirement ? (
                        <button type="button" className="type-link" onClick={() => goToItem(requirement.id)}>
                          {requirement.key}
                        </button>
                      ) : null}
                      <PersonAvatar person={assignee} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(TEST_RESULT_LABEL) as TestResult[]).map((result) => (
                      <StateAction
                        key={result}
                        tone={RESULT_TONE[result]}
                        active={execution.result === result}
                        isDisabled={locked}
                        onPress={() => apply(usePm.getState().recordExecution(execution.id, result))}
                      >
                        {TEST_RESULT_LABEL[result]}
                      </StateAction>
                    ))}
                    {execution.result === "FAILED" || execution.result === "BLOCKED" ? (
                      defect ? (
                        <button type="button" className="type-link px-2" onClick={() => goToItem(defect.id)}>
                          {defect.key}
                        </button>
                      ) : (
                        <StateAction
                          tone={execution.result === "FAILED" ? "danger" : "review"}
                          onPress={() => {
                            const result = usePm.getState().createDefectFromExecution(execution.id);
                            apply(result, () => {
                              if (result.ok) {
                                const item = usePm.getState().items.find((entry) => entry.id === result.itemId);
                                notifyPmChange(item ? `已创建缺陷 ${item.key}` : "已创建缺陷");
                              }
                            });
                          }}
                        >
                          建缺陷
                        </StateAction>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">运行报告 · 通过率 {rate}%</summary>
<div className="flex flex-col gap-3 p-3">
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="type-section">运行报告</h2>
            <p className="type-meta mt-1">
              通过率 {rate}% · 跳过 {skipped} · {reportedTotal} 条
            </p>
            {frozen ? <p className="type-caption mt-1">这是完成时定格的计数，之后改用例不会改这些数字。</p> : activeRun.status === "COMPLETED" ? <p className="type-caption mt-1">这次完成时没有定格，数字按当前结果计算。</p> : null}
            <p className="type-body mt-2">{verdict(activeRun, rows)}</p>
            {failedRows.length > 0 ? (
              <div className="mt-3 flex flex-col">
                {failedRows.map((execution) => {
                  const testCase = cases.find((entry) => entry.id === execution.caseId);
                  const defect = items.find((item) => item.id === execution.defectId);
                  if (!testCase || !execution.result) return null;
                  return (
                    <div key={execution.id} className="flex flex-wrap items-center gap-2 border-t border-border py-2">
                      <StateChip tone={RESULT_TONE[execution.result]}>{TEST_RESULT_LABEL[execution.result]}</StateChip>
                      <span className="type-key shrink-0 whitespace-nowrap">{testCase.key}</span>
                      <span className="type-body min-w-0 flex-1 break-words line-clamp-2">{testCase.title}</span>
                      {defect ? (
                        <button type="button" className="type-link" onClick={() => goToItem(defect.id)}>
                          {defect.key}
                        </button>
                      ) : (
                        <span className="type-caption">未建缺陷</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

</div>
</details>
        </>
      ) : null}
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">新建运行</summary>
<div className="flex flex-col gap-3 p-3">
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const caseIds = runType === "全量回归" ? activeCases.map((entry) => entry.id) : picked;
          const result = usePm.getState().createRun({
            projectId: project.id,
            name,
            runType,
            environment,
            versionId: versionId || null,
            caseIds,
          });
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setError("");
          setName("");
          setPicked([]);
          setRunId(result.id);
          setCancelling(false);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField value={name} onChange={setName}>
            <Label>运行名称</Label>
            <Input placeholder="例如 1.8.0 回归" />
          </TextField>
          <LabeledField label="类型">
            <OptionSelect label="运行类型" value={runType} options={CREATE_TYPES.map((id) => ({ id, label: id, hint: id === "全量回归" ? "只纳入生效用例" : "自己勾选用例" }))} onChange={setRunType} />
          </LabeledField>
          <LabeledField label="环境">
            <OptionSelect label="环境" value={environment} options={ENVIRONMENTS.map((id) => ({ id, label: id }))} onChange={setEnvironment} />
          </LabeledField>
          <LabeledField label="版本">
            <VersionSelect versions={projectVersions} value={versionId} onChange={setVersionId} emptyLabel="不指定版本" />
          </LabeledField>
        </div>
        {runType === "全量回归" ? <p className="type-meta">将纳入 {activeCases.length} 条生效用例。</p> : null}
        {runType === "临时抽测" ? (
          <div className="flex flex-col gap-2">
            <div className="type-label">用例 · 已选 {picked.length}</div>
            <div className="flex flex-wrap gap-1">
              {pickable.map((testCase) => {
                const on = picked.includes(testCase.id);
                return (
                  <button
                    key={testCase.id}
                    type="button"
                    aria-pressed={on}
                    className={cn("rounded-sm px-2 py-1", on ? "type-emphasis bg-line text-primary" : "type-caption border border-border")}
                    onClick={() => setPicked((current) => (current.includes(testCase.id) ? current.filter((id) => id !== testCase.id) : [...current, testCase.id]))}
                  >
                    {testCase.key}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {error ? <p className="type-body text-danger">{error}</p> : null}
        <div>
          <Button type="submit" variant="primary">
            创建运行
          </Button>
        </div>
      <button type="button" className="type-body min-h-10 self-start rounded-sm border border-border px-3 py-2" onClick={(event) => { const panel = event.currentTarget.closest("details"); panel?.removeAttribute("open"); panel?.querySelector("summary")?.focus(); }}>收起（保留草稿）</button>
</form>

</div>
</details>
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">用例库与套件 · {projectCases.length} 条用例</summary>
<div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-section">用例库</h2>
        <Button variant="outline" onPress={() => setShowArchived((value) => !value)}>{showArchived ? "隐藏已归档" : "显示已归档"}</Button>
      </div>
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const result = usePm.getState().createSuite({ projectId: project.id, name: suiteName });
          if (!result.ok) toast.error(result.message);
          else {
            setSuiteName("");
            notifyPmChange("已添加套件");
          }
        }}
      >
        <TextField value={suiteName} onChange={setSuiteName} className="min-w-0 flex-1">
          <Label>新套件</Label>
          <Input placeholder="套件名称" />
        </TextField>
        <Button type="submit" variant="primary">
          添加套件
        </Button>
      </form>
      {suites.length === 0 ? <EmptyHint>这个项目还没有用例。</EmptyHint> : null}
      {suites.filter(Boolean).map((suite) => {
        const members = projectCases.filter((entry) => entry.suite === suite && (showArchived || entry.status !== "ARCHIVED"));
        const candidates = projectCases.filter((entry) => entry.status !== "ARCHIVED" && entry.suite !== suite);
        return (
          <section key={suite} className="overflow-hidden rounded-sm border border-border bg-surface">
            <div className="type-label border-b border-border px-3 py-2">{suite} · {members.length}</div>
            {members.length === 0 ? <p className="type-caption px-3 py-2">套件里还没有用例。</p> : null}
            {members.map((testCase) => {
              const requirement = items.find((item) => item.id === testCase.requirementId);
              return (
                <div key={testCase.id} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                  <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left" onClick={() => setDetailId(testCase.id)}>
                    <span className="type-key shrink-0 whitespace-nowrap">{testCase.key}</span>
                    <span className="type-body min-w-0 flex-1 break-words line-clamp-2">{testCase.title}</span>
                    <StateChip tone={testCase.status === "ACTIVE" ? "done" : testCase.status === "REVIEW" ? "review" : "neutral"}>{TEST_CASE_STATUS_LABEL[testCase.status]}</StateChip>
                    <span className="type-caption">{testCase.steps?.length ?? 0} 步</span>
                    {requirement ? <span className="type-caption">{requirement.key}</span> : null}
                  </button>
                  <Button variant="outline" onPress={() => {
                    const result = usePm.getState().assignCaseSuite(testCase.id, "");
                    if (!result.ok) toast.error(result.message);
                  }}>移出</Button>
                </div>
              );
            })}
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <OptionSelect label="加入用例" value={joinCase[suite] ?? ""} options={candidates.map((entry) => ({ id: entry.id, label: `${entry.key} ${entry.title}` }))} onChange={(id) => setJoinCase((current) => ({ ...current, [suite]: id }))} />
              <Button variant="primary" onPress={() => {
                const result = usePm.getState().assignCaseSuite(joinCase[suite] ?? "", suite);
                if (!result.ok) toast.error(result.message);
                else setJoinCase((current) => ({ ...current, [suite]: "" }));
              }}>加入</Button>
            </div>
          </section>
        );
      })}
      {projectCases.some((entry) => !entry.suite && (showArchived || entry.status !== "ARCHIVED")) ? (
        <section className="overflow-hidden rounded-sm border border-border bg-surface">
          <div className="type-label border-b border-border px-3 py-2">未分套件</div>
          {projectCases.filter((entry) => !entry.suite && (showArchived || entry.status !== "ARCHIVED")).map((testCase) => (
            <button key={testCase.id} type="button" className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0" onClick={() => setDetailId(testCase.id)}>
              <span className="type-key shrink-0 whitespace-nowrap">{testCase.key}</span>
              <span className="type-body min-w-0 flex-1 break-words line-clamp-2">{testCase.title}</span>
            </button>
          ))}
        </section>
      ) : null}

</div>
</details>
      {detailId ? <CaseDetail key={detailId} caseId={detailId} onClose={() => setDetailId(null)} onOpen={setDetailId} /> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-4 py-3">
      <div className="type-caption">{label}</div>
      <div className="type-title mt-1">{value}</div>
    </div>
  );
}

function CaseDetail({ caseId, onClose, onOpen }: { caseId: string; onClose: () => void; onOpen: (id: string) => void }) {
  const current = usePm((state) => state.testCases.find((entry) => entry.id === caseId));
  const requirements = usePm((state) => state.items.filter((item) => item.projectId === current?.projectId && item.kind === "requirement"));
  const suiteNames = usePm((state) => state.suites.filter((entry) => entry.projectId === current?.projectId).map((entry) => entry.name));
  const [precondition, setPrecondition] = useState(current?.precondition ?? "");
  const [steps, setSteps] = useState(current?.steps ?? []);
  const [suite, setSuite] = useState(current?.suite ?? "");
  const [requirementId, setRequirementId] = useState(current?.requirementId ?? "");
  const [action, setAction] = useState("");
  const [expected, setExpected] = useState("");
  if (!current) return null;
  return (
    <AppModal open title={`${current.key} ${current.title}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        <p className="type-caption">{TEST_CASE_STATUS_LABEL[current.status]}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OptionSelect label="套件" value={suite} options={[{ id: "", label: "未分套件" }, ...suiteNames.map((name) => ({ id: name, label: name }))]} onChange={setSuite} />
          <OptionSelect label="关联需求" value={requirementId} options={[{ id: "", label: "不关联" }, ...requirements.map((item) => ({ id: item.id, label: `${item.key} ${item.title}` }))]} onChange={setRequirementId} />
        </div>
        <TextField value={precondition} onChange={setPrecondition}>
          <Label>前置条件</Label>
          <TextArea placeholder="执行前要满足什么" />
        </TextField>
        <div className="flex flex-col gap-2">
          <h3 className="type-section">步骤</h3>
          {steps.length === 0 ? <p className="type-meta">还没有步骤。</p> : null}
          {steps.map((step, index) => (
            <div key={`${current.id}-${index}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="type-body">{index + 1}. {step.action}</p>
                <p className="type-caption">期望：{step.expected || "未写"}</p>
              </div>
              <Button variant="outline" onPress={() => setSteps(steps.filter((_, stepIndex) => stepIndex !== index))}>移除</Button>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TextField value={action} onChange={setAction}>
              <Label>操作</Label>
              <Input />
            </TextField>
            <TextField value={expected} onChange={setExpected}>
              <Label>期望</Label>
              <Input />
            </TextField>
          </div>
          <div>
            <Button variant="outline" onPress={() => {
              if (!action.trim() && !expected.trim()) return;
              setSteps([...steps, { action, expected }]);
              setAction("");
              setExpected("");
            }}>加一步</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onPress={() => {
            const result = usePm.getState().updateCase(current.id, { precondition, steps, suite, requirementId: requirementId || null });
            if (!result.ok) toast.error(result.message);
            else notifyPmChange("已保存用例");
          }}>保存</Button>
          <Button variant="outline" onPress={() => {
            const result = usePm.getState().copyCase(current.id);
            if (!result.ok) toast.error(result.message);
            else {
              notifyPmChange("已复制为草稿");
              onOpen(result.id);
            }
          }}>复制</Button>
          <Button variant="outline" onPress={() => {
            const next = current.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
            const result = usePm.getState().updateCase(current.id, { status: next });
            if (!result.ok) toast.error(result.message);
            else onClose();
          }}>{current.status === "ARCHIVED" ? "恢复" : "归档"}</Button>
        </div>
      </div>
    </AppModal>
  );
}
