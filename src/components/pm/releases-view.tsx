import { notifyPmChange } from "@/lib/pm/feedback";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DayField, EmptyHint, OptionSelect, PageHeading, StateChip, VersionCard } from "@/components/biz";
import { columnOf, RELEASE_STATUS_LABEL, type TestExecution, type TestRun, type WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { useGoToItem } from "@/components/pm/use-go-item";

export function ReleasesView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const allVersions = usePm((state) => state.versions);
  const allItems = usePm((state) => state.items);
  const versions = useMemo(() => allVersions.filter((entry) => entry.projectId === project?.id), [allVersions, project?.id]);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === project?.id), [allItems, project?.id]);
  const people = usePm((state) => state.people);
  const goToItem = useGoToItem();

  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="版本" hint="版本可以开始开发、测试、冻结或退回。发布单先提交，通过后再看门禁；不通过必须填写豁免原因。发布后快照不再变化。" />
      {versions.map((version) => (
        <VersionCard
          key={version.id}
          version={version}
          items={items.filter((item) => item.versionId === version.id)}
          people={people}
          onOpen={goToItem}
          onTransition={(to) => usePm.getState().transitionVersion(version.id, to)}
          onDate={(plannedReleaseDate) => usePm.getState().updateVersion(version.id, { plannedReleaseDate })}
          dateMarks={versions
            .filter((entry) => entry.id !== version.id)
            .map((entry) => ({ date: entry.plannedReleaseDate, tone: "done" as const }))}
        />
      ))}
      <NewVersion projectId={project.id} />
      <ReleaseDesk projectId={project.id} />
    </div>
  );
}

function NewVersion({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  const [versionNumber, setVersionNumber] = useState("");
  const [plannedReleaseDate, setPlannedReleaseDate] = useState("2026-11-14");
  const [description, setDescription] = useState("");
  return (
    <form
      className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const result = usePm.getState().createVersion({ projectId, name, versionNumber, plannedReleaseDate, description });
        if (!result.ok) toast.error(result.message);
        else {
          setName("");
          setVersionNumber("");
          setDescription("");
          notifyPmChange("已添加版本");
        }
      }}
    >
      <h2 className="type-section">新建版本</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField value={versionNumber} onChange={setVersionNumber}>
          <Label>版本号</Label>
          <Input placeholder="1.8.0" />
        </TextField>
        <TextField value={name} onChange={setName}>
          <Label>名称</Label>
          <Input placeholder="十月发布" />
        </TextField>
      </div>
      <DayField label="计划发布" value={plannedReleaseDate} onChange={setPlannedReleaseDate} />
      <TextField value={description} onChange={setDescription}>
        <Label>说明</Label>
        <Input placeholder="这一版要带上什么" />
      </TextField>
      <div>
        <Button type="submit" variant="primary">
          添加版本
        </Button>
      </div>
    </form>
  );
}

function openItem(item: WorkItem) {
  const column = columnOf(item.kind, item.status);
  return column !== "done" && column !== "cancelled";
}

function versionReadiness(versionId: string, items: WorkItem[], cases: { requirementId: string | null; id: string; key: string; title: string }[], runs: TestRun[], executions: TestExecution[]) {
  const scope = items.filter((item) => item.versionId === versionId);
  const requirementIds = new Set(scope.filter((item) => item.kind === "requirement").map((item) => item.id));
  const caseIds = new Set(cases.filter((entry) => entry.requirementId && requirementIds.has(entry.requirementId)).map((entry) => entry.id));
  const runIds = new Set(runs.filter((run) => run.versionId === versionId && run.status !== "CANCELLED").map((run) => run.id));
  const failedRows = executions.filter((execution) => runIds.has(execution.runId) && caseIds.has(execution.caseId) && (execution.result === "FAILED" || execution.result === "BLOCKED"));
  const openRequirements = scope.filter((item) => item.kind === "requirement" && openItem(item)).length;
  const openTasks = scope.filter((item) => item.kind === "task" && openItem(item)).length;
  const openDefects = scope.filter((item) => item.kind === "defect" && openItem(item)).length;
  const failures = failedRows.map((execution) => {
    const testCase = cases.find((entry) => entry.id === execution.caseId);
    return { key: testCase?.key ?? execution.caseId, title: testCase?.title ?? "", result: execution.result ?? "" };
  });
  const ready = scope.length > 0 && openRequirements === 0 && openTasks === 0 && openDefects === 0 && failedRows.length === 0;
  return { scope: scope.length, scopeItems: scope, openRequirements, openTasks, openDefects, failed: failedRows.length, failures, ready };
}

function ReleaseDesk({ projectId }: { projectId: string }) {
  const allVersions = usePm((state) => state.versions);
  const allItems = usePm((state) => state.items);
  const allEnvironments = usePm((state) => state.environments);
  const allReleases = usePm((state) => state.releases);
  const allCases = usePm((state) => state.testCases);
  const allRuns = usePm((state) => state.testRuns);
  const allExecutions = usePm((state) => state.testExecutions);
  const versions = useMemo(() => allVersions.filter((entry) => entry.projectId === projectId), [allVersions, projectId]);
  const items = useMemo(() => allItems.filter((entry) => entry.projectId === projectId), [allItems, projectId]);
  const environments = useMemo(() => allEnvironments.filter((entry) => entry.projectId === projectId), [allEnvironments, projectId]);
  const releases = useMemo(() => allReleases.filter((entry) => entry.projectId === projectId), [allReleases, projectId]);
  const cases = useMemo(() => allCases.filter((entry) => entry.projectId === projectId), [allCases, projectId]);
  const runs = useMemo(() => allRuns.filter((entry) => entry.projectId === projectId), [allRuns, projectId]);
  const [versionId, setVersionId] = useState(versions[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [envName, setEnvName] = useState("");
  const [envKind, setEnvKind] = useState("测试");
  const [title, setTitle] = useState("");
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");
  const [releaseVersionId, setReleaseVersionId] = useState(versions[0]?.id ?? "");
  const [releaseId, setReleaseId] = useState(releases[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [waiver, setWaiver] = useState("");
  const selected = releases.find((entry) => entry.id === releaseId) ?? releases[0] ?? null;
  const scoped = items.filter((item) => item.versionId === versionId);
  const outside = items.filter((item) => item.versionId !== versionId);
  const versionOptions = versions.map((version) => ({ id: version.id, label: `${version.versionNumber} ${version.name}` }));
  const ready = versionReadiness(versionId, items, cases, runs, allExecutions);

  return (
    <>
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">版本范围</h2>
        <p className="type-meta">冻结、已发布或已废弃的版本不能加减事项。</p>
        <OptionSelect label="版本" value={versionId} options={versionOptions} onChange={setVersionId} />
        <div className="rounded-sm border border-border bg-bg px-3 py-3">
          <div className="type-emphasis">{ready.scope === 0 ? "还没有范围" : ready.ready ? "可以发布" : "还不能发布"}</div>
          <p className="type-caption mt-1">
            范围 {ready.scope} 项 · 未完成需求 {ready.openRequirements} · 未完成任务 {ready.openTasks} · 未关缺陷 {ready.openDefects} · 失败或阻塞 {ready.failed}
          </p>
        </div>
        {scoped.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <span className="type-link">{item.key}</span>
            <span className="type-body min-w-0 flex-1 truncate">{item.title}</span>
            <Button variant="outline" onPress={() => {
              const result = usePm.getState().setItemVersion(item.id, null);
              if (!result.ok) toast.error(result.message);
            }}>
              移出
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <OptionSelect label="加入事项" value={itemId} options={outside.map((item) => ({ id: item.id, label: `${item.key} ${item.title}` }))} onChange={setItemId} />
          <Button
            variant="primary"
            onPress={() => {
              const result = usePm.getState().setItemVersion(itemId, versionId || null);
              if (!result.ok) toast.error(result.message);
              else setItemId("");
            }}
          >
            加入范围
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">发布环境</h2>
        {environments.map((environment) => (
          <p key={environment.id} className="type-body">
            {environment.name}
            <span className="type-caption"> · {environment.kind}</span>
          </p>
        ))}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField value={envName} onChange={setEnvName}>
            <Label>名称</Label>
            <Input placeholder="预发" />
          </TextField>
          <OptionSelect label="类型" value={envKind} options={["开发", "测试", "预发", "生产"].map((kind) => ({ id: kind, label: kind }))} onChange={setEnvKind} />
        </div>
        <div>
          <Button
            variant="primary"
            onPress={() => {
              const result = usePm.getState().createEnvironment({ projectId, name: envName, kind: envKind });
              if (!result.ok) toast.error(result.message);
              else {
                setEnvName("");
                notifyPmChange("已添加环境");
              }
            }}
          >
            添加环境
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">发布单</h2>
        {releases.map((release) => {
          const version = versions.find((entry) => entry.id === release.versionId);
          const environment = environments.find((entry) => entry.id === release.environmentId);
          return (
            <button
              key={release.id}
              type="button"
              className={`flex w-full flex-col gap-1 border-b border-border px-2 py-3 text-left last:border-b-0 ${release.id === selected?.id ? "bg-line" : ""}`}
              onClick={() => { setReleaseId(release.id); setNote(""); setWaiver(""); }}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="type-emphasis">{release.title}</span>
                <StateChip tone={release.status === "PUBLISHED" ? "done" : release.status === "APPROVED" ? "progress" : release.status === "SUBMITTED" ? "review" : "neutral"}>{RELEASE_STATUS_LABEL[release.status]}</StateChip>
              </span>
              <span className="type-caption">{version?.versionNumber ?? "未选版本"} · {environment?.name ?? "未选环境"}</span>
              <span className="type-body whitespace-pre-wrap">{release.summary}</span>
            </button>
          );
        })}
        <TextField value={title} onChange={setTitle}>
          <Label>标题</Label>
          <Input placeholder="1.7.0 发布草稿" />
        </TextField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OptionSelect label="版本" value={releaseVersionId} options={versionOptions} onChange={setReleaseVersionId} />
          <OptionSelect label="环境" value={environmentId} options={[{ id: "", label: "不指定" }, ...environments.map((environment) => ({ id: environment.id, label: environment.name }))]} onChange={setEnvironmentId} />
        </div>
        <div>
          <Button
            variant="primary"
            onPress={() => {
              const done = items.filter((item) => item.versionId === releaseVersionId && columnOf(item.kind, item.status) === "done");
              const summary = done.map((item) => `${item.key} ${item.title}`).join("\n");
              const result = usePm.getState().createRelease({
                projectId,
                versionId: releaseVersionId,
                environmentId: environmentId || null,
                title,
                summary: summary || "范围内还没有已完成事项。",
              });
              if (!result.ok) toast.error(result.message);
              else {
                setTitle("");
                setReleaseId(result.id);
                notifyPmChange("已创建发布草稿");
              }
            }}
          >
            从范围生成草稿
          </Button>
        </div>
        {selected ? (
          <ReleaseDetail
            release={selected}
            gate={versionReadiness(selected.versionId, items, cases, runs, allExecutions)}
            note={note}
            waiver={waiver}
            onNote={setNote}
            onWaiver={setWaiver}
          />
        ) : null}
      </section>
    </>
  );
}

function ReleaseDetail({
  release,
  gate,
  note,
  waiver,
  onNote,
  onWaiver,
}: {
  release: NonNullable<ReturnType<typeof usePm.getState>["releases"][number]>;
  gate: ReturnType<typeof versionReadiness>;
  note: string;
  waiver: string;
  onNote: (value: string) => void;
  onWaiver: (value: string) => void;
}) {
  const published = release.status === "PUBLISHED" ? release.snapshot : null;
  const checks = published
    ? [
        ["未完成需求", published.openRequirements],
        ["未完成任务", published.openTasks],
        ["未关缺陷", published.openDefects],
        ["失败或阻塞", published.failed],
      ]
    : [
        ["未完成需求", gate.openRequirements],
        ["未完成任务", gate.openTasks],
        ["未关缺陷", gate.openDefects],
        ["失败或阻塞", gate.failed],
      ];
  const items = published?.items ?? gate.scopeItems;
  const failures = published ? published.failures ?? [] : gate.failures;
  const act = (result: { ok: true } | { ok: false; message: string }, done: string) => {
    if (!result.ok) toast.error(result.message);
    else notifyPmChange(done);
  };
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border bg-bg p-3">
      <div>
        <h3 className="type-section">{release.title}</h3>
        <p className="type-caption mt-1">{published ? "以下是发布当时的快照，之后改范围或测试结果不会改这里。" : "门禁看当前范围。发布后会冻住当时的事项和失败结果。"}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {checks.map(([label, value]) => (
          <p key={String(label)} className="type-body rounded-sm bg-surface px-3 py-2">
            {label}
            <span className="type-emphasis ml-2">{value}</span>
            <span className="type-caption ml-2">{value === 0 ? "通过" : "未通过"}</span>
          </p>
        ))}
      </div>
      {release.decisionNote ? <p className="type-body">审批意见：{release.decisionNote}</p> : null}
      {published?.waiver ? <p className="type-body">豁免：{published.waiver}</p> : null}
      {items.length === 0 ? <p className="type-caption">范围内还没有事项。</p> : null}
      {items.map((item) => (
        <p key={item.id} className="type-body">
          <span className="type-link">{item.key}</span> {item.title}
          <span className="type-caption"> · {item.status}</span>
        </p>
      ))}
      {failures.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="type-label">失败或阻塞</h4>
          {failures.map((failure) => (
            <p key={`${failure.key}-${failure.result}`} className="type-body">{failure.key} {failure.title}<span className="type-caption"> · {failure.result}</span></p>
          ))}
        </div>
      ) : null}
      {release.status === "DRAFT" ? (
        <div>
          <Button variant="primary" onPress={() => act(usePm.getState().submitRelease(release.id), "已提交审批")}>提交审批</Button>
        </div>
      ) : null}
      {release.status === "SUBMITTED" ? (
        <div className="flex flex-col gap-3">
          <TextField value={note} onChange={onNote}>
            <Label>审批意见</Label>
            <TextArea placeholder="退回时必填" />
          </TextField>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onPress={() => act(usePm.getState().decideRelease(release.id, "APPROVED", note), "已通过")}>通过</Button>
            <Button variant="outline" onPress={() => act(usePm.getState().decideRelease(release.id, "DRAFT", note), "已退回草稿")}>退回</Button>
          </div>
        </div>
      ) : null}
      {release.status === "APPROVED" ? (
        <div className="flex flex-col gap-3">
          {gate.ready ? <p className="type-body">门禁已通过，可以直接发布。</p> : (
            <TextField value={waiver} onChange={onWaiver}>
              <Label>豁免原因</Label>
              <TextArea placeholder="说明为什么仍要发布" />
            </TextField>
          )}
          <div>
            <Button variant="primary" onPress={() => act(usePm.getState().publishRelease(release.id, waiver), "已发布，快照已留下")}>发布并留下快照</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}