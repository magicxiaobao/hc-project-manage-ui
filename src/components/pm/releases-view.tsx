import { Button, Input, Label, TextField } from "@heroui/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DayField, EmptyHint, OptionSelect, PageHeading, StateChip, VersionCard } from "@/components/biz";
import { columnOf, RELEASE_STATUS_LABEL, type ReleaseStatus, type TestExecution, type TestRun, type WorkItem } from "@/lib/pm/domain";
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
      <PageHeading title="版本" hint="流转沿用版本事件：开始开发、开始测试、冻结、退回。冻结后范围仍可查看，改范围要先重新测试。" />
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
          toast("已添加版本");
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

function versionReadiness(versionId: string, items: WorkItem[], cases: { requirementId: string | null; id: string }[], runs: TestRun[], executions: TestExecution[]) {
  const scope = items.filter((item) => item.versionId === versionId);
  const requirementIds = new Set(scope.filter((item) => item.kind === "requirement").map((item) => item.id));
  const caseIds = new Set(cases.filter((entry) => entry.requirementId && requirementIds.has(entry.requirementId)).map((entry) => entry.id));
  const runIds = new Set(runs.filter((run) => run.versionId === versionId && run.status !== "CANCELLED").map((run) => run.id));
  const failed = executions.filter((execution) => runIds.has(execution.runId) && caseIds.has(execution.caseId) && (execution.result === "FAILED" || execution.result === "BLOCKED")).length;
  const openRequirements = scope.filter((item) => item.kind === "requirement" && openItem(item)).length;
  const openTasks = scope.filter((item) => item.kind === "task" && openItem(item)).length;
  const openDefects = scope.filter((item) => item.kind === "defect" && openItem(item)).length;
  const ready = scope.length > 0 && openRequirements === 0 && openTasks === 0 && openDefects === 0 && failed === 0;
  return { scope: scope.length, openRequirements, openTasks, openDefects, failed, ready };
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
                toast("已添加环境");
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
            <div key={release.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-emphasis">{release.title}</span>
                <StateChip tone={release.status === "PUBLISHED" ? "done" : "neutral"}>{RELEASE_STATUS_LABEL[release.status as ReleaseStatus]}</StateChip>
              </div>
              <p className="type-caption">
                {version?.versionNumber ?? "未选版本"} · {environment?.name ?? "未选环境"}
              </p>
              <p className="type-body whitespace-pre-wrap">{release.summary}</p>
              {release.status === "DRAFT" ? (
                <div>
                  <Button
                    variant="primary"
                    onPress={() => {
                      const result = usePm.getState().publishRelease(release.id);
                      if (!result.ok) toast.error(result.message);
                    }}
                  >
                    发布
                  </Button>
                </div>
              ) : null}
            </div>
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
                toast("已创建发布草稿");
              }
            }}
          >
            从范围生成草稿
          </Button>
        </div>
      </section>
    </>
  );
}
