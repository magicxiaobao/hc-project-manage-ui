import {
  columnOf,
  type ReleaseVersion,
  type TestCase,
  type TestExecution,
  type TestRun,
  type WorkItem,
} from "@/lib/pm/domain";

export interface TraceExecution {
  execution: TestExecution;
  testCase: TestCase;
  run: TestRun | undefined;
}

export interface RequirementTrace {
  requirement: WorkItem;
  tasks: WorkItem[];
  children: WorkItem[];
  cases: TestCase[];
  runs: TestRun[];
  executions: TraceExecution[];
  defects: WorkItem[];
  versions: ReleaseVersion[];
}

export type TraceGap = "无用例" | "有失败" | "未关缺陷";

function familyOf(rootId: string, items: WorkItem[]) {
  const seen = new Set<string>([rootId]);
  const family: WorkItem[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop();
    if (!id) continue;
    for (const item of items) {
      if (item.parentId !== id || seen.has(item.id)) continue;
      seen.add(item.id);
      family.push(item);
      queue.push(item.id);
    }
  }
  return family;
}

export function traceRequirement(
  requirement: WorkItem,
  items: WorkItem[],
  cases: TestCase[],
  runs: TestRun[],
  executions: TestExecution[],
  versions: ReleaseVersion[],
): RequirementTrace {
  const family = familyOf(requirement.id, items);
  const ids = new Set([requirement.id, ...family.map((item) => item.id)]);
  const linkedCases = cases.filter((entry) => entry.requirementId && ids.has(entry.requirementId) && entry.projectId === requirement.projectId);
  const caseIds = new Set(linkedCases.map((entry) => entry.id));
  const linkedExecutions = executions.filter((entry) => caseIds.has(entry.caseId));
  const runIds = new Set(linkedExecutions.map((entry) => entry.runId));
  const linkedRuns = runs.filter((entry) => runIds.has(entry.id));
  const versionIds = new Set(
    [requirement, ...family, ...linkedRuns]
      .map((entry) => ("versionId" in entry ? entry.versionId : null))
      .filter((id): id is string => Boolean(id)),
  );
  return {
    requirement,
    tasks: family.filter((item) => item.kind === "task"),
    children: family.filter((item) => item.kind === "requirement"),
    cases: linkedCases,
    runs: linkedRuns,
    executions: linkedExecutions.map((execution) => ({
      execution,
      testCase: linkedCases.find((entry) => entry.id === execution.caseId)!,
      run: linkedRuns.find((entry) => entry.id === execution.runId),
    })),
    defects: family.filter((item) => item.kind === "defect"),
    versions: versions.filter((entry) => versionIds.has(entry.id)),
  };
}

export function traceGaps(trace: RequirementTrace): TraceGap[] {
  const gaps: TraceGap[] = [];
  if (trace.cases.length === 0) gaps.push("无用例");
  if (trace.executions.some((entry) => entry.execution.result === "FAILED" || entry.execution.result === "BLOCKED")) gaps.push("有失败");
  if (trace.defects.some((item) => columnOf(item.kind, item.status) !== "done" && columnOf(item.kind, item.status) !== "cancelled")) gaps.push("未关缺陷");
  return gaps;
}

export function evidenceMatrix(trace: RequirementTrace, items: WorkItem[]) {
  return trace.cases.map((testCase) => {
    const related = trace.executions.filter((entry) => entry.testCase.id === testCase.id);
    const latest = [...related].reverse().find((entry) => entry.execution.result) ?? related.at(-1);
    const defectId = [...related].reverse().find((entry) => entry.execution.defectId)?.execution.defectId ?? null;
    return {
      testCase,
      result: latest?.execution.result ?? null,
      runName: latest?.run?.name ?? "",
      defect: items.find((item) => item.id === defectId) ?? null,
    };
  });
}

export function openDefects(trace: RequirementTrace) {
  return trace.defects.filter((item) => columnOf(item.kind, item.status) !== "done" && columnOf(item.kind, item.status) !== "cancelled");
}
