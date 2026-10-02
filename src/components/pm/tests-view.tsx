import { notifyPmChange } from "@/lib/pm/feedback";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyHint, LabeledField, OptionSelect, PageHeading, PersonAvatar, PriorityMark, StateAction, StateChip, VersionSelect } from "@/components/biz";
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

export function TestsView({ projectKey }: { projectKey: string }) {
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
  const [runId, setRunId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [runType, setRunType] = useState("全量回归");
  const [environment, setEnvironment] = useState("测试环境");
  const [versionId, setVersionId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [suiteName, setSuiteName] = useState("");
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [stepAction, setStepAction] = useState("");
  const [stepExpected, setStepExpected] = useState("");
  const suiteRecords = usePm((state) => state.suites);
  const goToItem = useGoToItem();
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  const activeRun = projectRuns.find((run) => run.id === (runId ?? projectRuns[0]?.id)) ?? null;
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
  const passed = count("PASSED");
  const rate = rows.length ? Math.round((passed / rows.length) * 100) : 0;

  const apply = (result: { ok: true } | { ok: false; message: string }, done?: () => void) => {
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    done?.();
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="测试" hint="创建运行，开始后记通过、失败、阻塞或跳过。失败和阻塞可以建缺陷。全部记完才能完成，完成后可以对失败项做定向复测。" />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="运行" value={projectRuns.length} />
        <Stat label="执行中" value={runningCount} />
        <Stat label="待建缺陷" value={defectGap} />
      </div>
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
      </form>
      <h2 className="type-section">运行</h2>
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
              type="button"
              className={cn("flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left last:border-b-0", selected && "bg-line")}
              onClick={() => {
                setRunId(run.id);
                setCancelling(false);
                setCancelReason("");
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
      {activeRun ? (
        <>
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="通过" value={count("PASSED")} />
            <Stat label="失败" value={count("FAILED")} />
            <Stat label="阻塞" value={count("BLOCKED")} />
            <Stat label="未测" value={count(null)} />
          </div>
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {rows.map((execution) => {
              const testCase = cases.find((entry) => entry.id === execution.caseId);
              if (!testCase) return null;
              const requirement = items.find((item) => item.id === testCase.requirementId);
              const assignee = people.find((person) => person.id === testCase.assigneeId);
              const defect = items.find((item) => item.id === execution.defectId);
              const locked = activeRun.status !== "RUNNING";
              return (
                <div key={execution.id} className="flex flex-col gap-2 border-b border-border px-3 py-3 last:border-b-0 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="type-link">{testCase.key}</span>
                      <span className="type-body truncate">{testCase.title}</span>
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
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="type-section">运行报告</h2>
            <p className="type-meta mt-1">
              通过率 {rate}% · 跳过 {count("SKIPPED")} · {rows.length} 条
            </p>
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
                      <span className="type-link">{testCase.key}</span>
                      <span className="type-body min-w-0 flex-1 truncate">{testCase.title}</span>
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
        </>
      ) : null}
      <h2 className="type-section">用例库</h2>
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
      {suites.map((suite) => (
        <section key={suite} className="overflow-hidden rounded-sm border border-border bg-surface">
          <div className="type-label border-b border-border px-3 py-2">{suite}</div>
          {projectCases
            .filter((entry) => entry.suite === suite)
            .map((testCase) => {
              const requirement = items.find((item) => item.id === testCase.requirementId);
              return (
                <div key={testCase.id} className="border-b border-border last:border-b-0">
                  <button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left" onClick={() => setOpenCase((current) => (current === testCase.id ? null : testCase.id))}>
                    <span className="type-link">{testCase.key}</span>
                    <span className="type-body min-w-0 flex-1 truncate">{testCase.title}</span>
                    <span className="type-caption hidden sm:inline">{testCase.testType}</span>
                    <StateChip tone={testCase.status === "ACTIVE" ? "done" : testCase.status === "REVIEW" ? "review" : "neutral"}>{TEST_CASE_STATUS_LABEL[testCase.status]}</StateChip>
                    <span className="type-caption">{testCase.steps?.length ?? 0} 步</span>
                  </button>
                  {requirement ? (
                    <div className="px-3 pb-2">
                      <button type="button" className="type-link" onClick={() => goToItem(requirement.id)}>
                        {requirement.key}
                      </button>
                    </div>
                  ) : null}
                  {openCase === testCase.id ? (
                    <div className="flex flex-col gap-2 px-3 pb-3">
                      {(testCase.steps ?? []).length === 0 ? <p className="type-meta">还没有步骤。</p> : null}
                      {(testCase.steps ?? []).map((step, index) => (
                        <p key={`${testCase.id}-${index}`} className="type-body">
                          {index + 1}. {step.action}
                          <span className="type-caption"> → {step.expected}</span>
                        </p>
                      ))}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <TextField value={stepAction} onChange={setStepAction}>
                          <Label>操作</Label>
                          <Input />
                        </TextField>
                        <TextField value={stepExpected} onChange={setStepExpected}>
                          <Label>期望</Label>
                          <Input />
                        </TextField>
                        <Button
                          variant="primary"
                          onPress={() => {
                            if (!stepAction.trim() && !stepExpected.trim()) return;
                            usePm.getState().saveCaseSteps(testCase.id, [...(testCase.steps ?? []), { action: stepAction, expected: stepExpected }]);
                            setStepAction("");
                            setStepExpected("");
                          }}
                        >
                          加一步
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
        </section>
      ))}
    </div>
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
