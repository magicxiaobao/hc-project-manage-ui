/**
 * 需求追溯视图（P1：p1-requirement-trace）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 追溯图：GET /requirement/v1/trace/{id} → 六个追溯分桶（任务/用例/执行轮/执行/缺陷/版本）+ 追溯边
 * - 影响范围：GET /requirement/v1/trace/{id}/impact → root/nodes/edges 影响图
 * - 追溯矩阵：POST /requirement/v1/trace/matrix/findByPage → 分页矩阵表（筛选=标题/类型/状态）
 * - 子需求层级：GET /requirement/v1/hierarchy?projectId= 建树骨架（parentId 链接），
 *   展开节点时用 GET /requirement/v1/{id}/children 拉取权威直属子需求
 *
 * 未登录走演示追溯视图（TraceView）时不使用本组件。
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Input, Spinner, TextField } from "@heroui/react";
import { EmptyHint, OptionSelect, PageHeading, StateChip, StatusChip } from "@/components/biz";
import { itemStatusTone } from "@/components/biz/state-tone";
import {
  toUserMessage,
  useRequirementChildren,
  useRequirementHierarchy,
  useRequirementImpact,
  useRequirementList,
  useRequirementOptions,
  useRequirementTrace,
  useTraceMatrix,
} from "@/lib/query";
import type {
  RequirementMatrixQuery,
  RequirementResponse,
  TraceBucket,
  TraceEdgeResponse,
  TraceNodeSummary,
} from "@/lib/api/requirement-types";
import { cn } from "@/lib/utils";

type TraceTab = "graph" | "impact" | "matrix" | "hierarchy";

const TABS: Array<{ id: TraceTab; label: string }> = [
  { id: "graph", label: "追溯图" },
  { id: "impact", label: "影响范围" },
  { id: "matrix", label: "追溯矩阵" },
  { id: "hierarchy", label: "子需求层级" },
];

const MATRIX_PAGE_SIZE = 20;

const SELECTOR_PAGE_SIZE = 20;

export function TraceViewLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const [tab, setTab] = useState<TraceTab>("graph");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Codex review 4175337083：追溯图 / 影响范围共用需求选择器支持标题搜索 +
  // 分页（登录态门控），不再局限于需求列表第一页前 100 条。
  const [selectorTitleInput, setSelectorTitleInput] = useState("");
  const [selectorTitle, setSelectorTitle] = useState("");
  const [selectorPage, setSelectorPage] = useState(1);
  const trimmedSelectorTitle = selectorTitle.trim();
  const requirementsQuery = useRequirementList({
    page: selectorPage,
    pageSize: SELECTOR_PAGE_SIZE,
    bean: trimmedSelectorTitle ? { title: trimmedSelectorTitle } : {},
    projectId,
  });
  const requirements = requirementsQuery.data?.list ?? [];
  const selectorTotal = requirementsQuery.data?.total ?? 0;
  const selectorTotalPages = Math.max(1, Math.ceil(selectorTotal / SELECTOR_PAGE_SIZE));
  const effectiveId = selectedId ?? requirements[0]?.id ?? null;
  const applySelectorSearch = () => {
    setSelectorTitle(selectorTitleInput);
    setSelectorPage(1);
  };
  const selectorProps = {
    requirements,
    requirementsPending: requirementsQuery.isPending,
    requirementsError: requirementsQuery.isError ? requirementsQuery.error : null,
    selectedId: effectiveId,
    onSelect: (id: number) => setSelectedId(id),
    titleInput: selectorTitleInput,
    onTitleInputChange: setSelectorTitleInput,
    onSearch: applySelectorSearch,
    page: selectorPage,
    totalPages: selectorTotalPages,
    total: selectorTotal,
    onPageChange: (next: number) => setSelectorPage(next),
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="需求追溯" hint="追溯图与影响范围看单需求的关联对象；追溯矩阵看项目全量覆盖；子需求层级看父子关系。" />
      <div className="flex gap-2" role="tablist" aria-label="追溯视图">
        {TABS.map((entry) => (
          <Button
            key={entry.id}
            aria-pressed={tab === entry.id}
            variant={tab === entry.id ? "primary" : "ghost"}
            size="sm"
            onPress={() => setTab(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
      {tab === "graph" ? (
        <TraceGraphTab
          projectKey={projectKey}
          {...selectorProps}
        />
      ) : null}
      {tab === "impact" ? (
        <ImpactTab
          projectKey={projectKey}
          {...selectorProps}
        />
      ) : null}
      {tab === "matrix" ? <TraceMatrixTab projectId={projectId} projectKey={projectKey} /> : null}
      {tab === "hierarchy" ? <HierarchyTab projectId={projectId} projectKey={projectKey} /> : null}
    </div>
  );
}

interface SelectorProps {
  projectKey: string;
  requirements: RequirementResponse[];
  requirementsPending: boolean;
  requirementsError: unknown;
  selectedId: number | null;
  onSelect: (id: number) => void;
  titleInput: string;
  onTitleInputChange: (value: string) => void;
  onSearch: () => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

function RequirementSelector({
  projectKey,
  requirements,
  requirementsPending,
  requirementsError,
  selectedId,
  onSelect,
  titleInput,
  onTitleInputChange,
  onSearch,
  page,
  totalPages,
  total,
  onPageChange,
}: SelectorProps) {
  if (requirementsPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载需求列表…
      </div>
    );
  }
  if (requirementsError) {
    return <p className="type-body text-danger">需求列表加载失败：{toUserMessage(requirementsError)}</p>;
  }
  if (requirements.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <div className="min-w-48 flex-1">
            <TextField value={titleInput} onChange={onTitleInputChange} aria-label="按标题搜索需求">
              <Input placeholder="按标题搜索需求，回车确认" />
            </TextField>
          </div>
          <Button type="submit" size="sm" variant="primary">
            搜索
          </Button>
        </form>
        <EmptyHint>没有匹配的需求（换关键词试试，或先去需求列表创建一条）。</EmptyHint>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="min-w-48 flex-1">
          <TextField value={titleInput} onChange={onTitleInputChange} aria-label="按标题搜索需求">
            <Input placeholder="按标题搜索需求，回车确认" />
          </TextField>
        </div>
        <Button type="submit" size="sm" variant="primary">
          搜索
        </Button>
      </form>
      <OptionSelect
        label="当前需求"
        value={selectedId != null ? String(selectedId) : ""}
        options={requirements.map((item) => ({ id: String(item.id), label: `#${item.id} ${item.title}` }))}
        onChange={(id) => onSelect(Number(id))}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="type-meta">
          共 {total} 条 · 第 {page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            isDisabled={page <= 1 || requirementsPending}
            onPress={() => onPageChange(Math.max(1, page - 1))}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={page >= totalPages || requirementsPending}
            onPress={() => onPageChange(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 后端 AlmObjectType（JSON = 枚举名）→ 中文对象标签 */
const OBJECT_TYPE_LABEL: Record<string, string> = {
  REQUIREMENT: "需求",
  TASK: "任务",
  TEST_CASE: "用例",
  TEST_RUN: "测试轮",
  TEST_EXECUTION: "执行",
  DEFECT: "缺陷",
  VERSION: "版本",
};

function TraceNodeStatus({ node }: { node: TraceNodeSummary }) {
  if (node.status == null) return null;
  // 需求/任务/缺陷走领域状态标签；其它追溯对象（用例/执行轮/执行/版本）
  // 领域词典不覆盖，直接中性展示原始状态值，避免映射错位。
  if (node.objectType === "REQUIREMENT") return <StatusChip kind="requirement" status={node.status} />;
  if (node.objectType === "TASK") return <StatusChip kind="task" status={node.status} />;
  if (node.objectType === "DEFECT") return <StatusChip kind="defect" status={node.status} />;
  return <StateChip tone={itemStatusTone("task", node.status)}>{node.status}</StateChip>;
}

function NodeLine({ node }: { node: TraceNodeSummary }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
      <span className="type-body min-w-0 flex-1 truncate">{node.displayName}</span>
      <span className="type-caption shrink-0 text-default-500">{OBJECT_TYPE_LABEL[node.objectType] ?? node.objectType}</span>
      <TraceNodeStatus node={node} />
      {!node.direct ? <span className="type-caption shrink-0 text-default-500">间接</span> : null}
    </div>
  );
}

function BucketCard({ title, bucket }: { title: string; bucket: TraceBucket<TraceNodeSummary> }) {
  return (
    <div className="overflow-hidden rounded-sm border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border bg-line/50 px-3 py-2">
        <span className="type-section">{title}</span>
        <span className="type-caption text-default-500">
          {bucket.total} 条{bucket.truncated ? "（仅显示部分）" : ""}
        </span>
      </div>
      {bucket.list.length === 0 ? (
        <p className="type-caption px-3 py-3 text-default-500">无关联对象。</p>
      ) : (
        bucket.list.map((node) => <NodeLine key={`${node.objectType}:${node.objectId}`} node={node} />)
      )}
    </div>
  );
}

function EdgeList({ edges, nameOf }: { edges: TraceEdgeResponse[]; nameOf: (key: { objectType: string; objectId: number }) => string }) {
  if (edges.length === 0) return <p className="type-caption text-default-500">无追溯边。</p>;
  return (
    <ul className="flex flex-col gap-1">
      {edges.map((edge, index) => (
        <li key={index} className="type-body">
          <span className="font-medium">{nameOf(edge.sourceObject)}</span>
          <span className="mx-2 text-default-500">—{edge.relationType}→</span>
          <span className="font-medium">{nameOf(edge.targetObject)}</span>
          {!edge.direct ? <span className="type-caption ml-2 text-default-500">间接</span> : null}
        </li>
      ))}
    </ul>
  );
}

function formatIsoDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function TraceGraphTab({ projectKey, ...selector }: SelectorProps) {
  const traceQuery = useRequirementTrace(selector.selectedId);

  return (
    <div className="flex flex-col gap-4">
      <RequirementSelector
        projectKey={projectKey}
        {...selector}
      />
      {selector.selectedId == null ? null : traceQuery.isPending ? (
        <div className="flex items-center gap-2 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载追溯图…
        </div>
      ) : traceQuery.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="type-body text-danger">追溯图加载失败：{toUserMessage(traceQuery.error)}</p>
          <Button variant="ghost" onPress={() => void traceQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : traceQuery.data ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="type-section">{traceQuery.data.requirement.displayName}</span>
            {traceQuery.data.requirement.status ? <StatusChip kind="requirement" status={traceQuery.data.requirement.status} /> : null}
            <Link
              to="/p/$projectKey/requirements/$requirementId"
              params={{ projectKey, requirementId: String(selector.selectedId) }}
              className="type-caption text-primary hover:underline"
            >
              查看需求详情
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <BucketCard title="任务" bucket={traceQuery.data.tasks} />
            <BucketCard title="测试用例" bucket={traceQuery.data.testCases} />
            <BucketCard title="测试轮" bucket={traceQuery.data.testRuns} />
            <BucketCard title="执行记录" bucket={traceQuery.data.testExecutions} />
            <BucketCard title="缺陷" bucket={traceQuery.data.defects} />
            <BucketCard title="版本" bucket={traceQuery.data.versions} />
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="type-section mb-2">追溯边（{traceQuery.data.edges.length}）</p>
            <EdgeList
              edges={traceQuery.data.edges}
              nameOf={(key) => {
                const all = [
                  traceQuery.data.requirement,
                  ...traceQuery.data.tasks.list,
                  ...traceQuery.data.testCases.list,
                  ...traceQuery.data.testRuns.list,
                  ...traceQuery.data.testExecutions.list,
                  ...traceQuery.data.defects.list,
                  ...traceQuery.data.versions.list,
                ];
                return all.find((node) => node.objectType === key.objectType && node.objectId === key.objectId)?.displayName
                  ?? `${key.objectType}#${key.objectId}`;
              }}
            />
          </div>
          <p className="type-caption text-default-500">生成于 {formatIsoDateTime(traceQuery.data.generatedAt)}</p>
        </div>
      ) : null}
    </div>
  );
}

function ImpactTab({ projectKey, ...selector }: SelectorProps) {
  const impactQuery = useRequirementImpact(selector.selectedId);

  return (
    <div className="flex flex-col gap-4">
      <RequirementSelector
        projectKey={projectKey}
        {...selector}
      />
      {selector.selectedId == null ? null : impactQuery.isPending ? (
        <div className="flex items-center gap-2 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载影响范围…
        </div>
      ) : impactQuery.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="type-body text-danger">影响范围加载失败：{toUserMessage(impactQuery.error)}</p>
          <Button variant="ghost" onPress={() => void impactQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : impactQuery.data ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="type-section">根节点：{impactQuery.data.root.displayName}</span>
            {impactQuery.data.root.status ? <StatusChip kind="requirement" status={impactQuery.data.root.status} /> : null}
            <span className="type-caption text-default-500">
              {impactQuery.data.totalNodes} 个节点{impactQuery.data.truncated ? "（仅显示部分）" : ""}
            </span>
          </div>
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {impactQuery.data.nodes.length === 0 ? (
              <p className="type-caption px-3 py-3 text-default-500">暂无受影响节点。</p>
            ) : (
              impactQuery.data.nodes.map((node) => <NodeLine key={`${node.objectType}:${node.objectId}`} node={node} />)
            )}
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="type-section mb-2">影响边（{impactQuery.data.edges.length}）</p>
            <EdgeList
              edges={impactQuery.data.edges}
              nameOf={(key) => {
                const all = [impactQuery.data.root, ...impactQuery.data.nodes];
                return all.find((node) => node.objectType === key.objectType && node.objectId === key.objectId)?.displayName
                  ?? `${key.objectType}#${key.objectId}`;
              }}
            />
          </div>
          <p className="type-caption text-default-500">生成于 {formatIsoDateTime(impactQuery.data.generatedAt)}</p>
        </div>
      ) : null}
    </div>
  );
}

function toSelectOptions(options: Array<{ value: string; label: string }>) {
  return [{ id: "", label: "全部" }, ...options.map((option) => ({ id: option.value, label: option.label }))];
}

function TraceMatrixTab({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const [titleInput, setTitleInput] = useState("");
  const [appliedTitle, setAppliedTitle] = useState("");
  const [requirementType, setRequirementType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const optionsQuery = useRequirementOptions();
  const options = optionsQuery.data;

  const bean = useMemo<RequirementMatrixQuery>(() => {
    const value: RequirementMatrixQuery = { projectId };
    const title = appliedTitle.trim();
    if (title) value.title = title;
    if (requirementType) value.requirementType = requirementType as RequirementMatrixQuery["requirementType"];
    if (status) value.status = status as RequirementMatrixQuery["status"];
    return value;
  }, [projectId, appliedTitle, requirementType, status]);

  const matrixQuery = useTraceMatrix({ page, pageSize: MATRIX_PAGE_SIZE, bean, projectId });
  const rows = matrixQuery.data?.list ?? [];
  const total = matrixQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / MATRIX_PAGE_SIZE));
  // Codex review 4175549755：页码越界（删除/权限变化导致当前页变空）时自动回到
  // 最后一页；空的越界页仍渲染分页器，避免用户被困在无处可回的空页。
  useEffect(() => {
    if (!matrixQuery.isPending && total > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [matrixQuery.isPending, total, totalPages, page]);

  const matrixPager = (
    <div className="flex items-center justify-between">
      <span className="type-caption text-default-500">
        共 {total} 条 · 第 {page}/{totalPages} 页
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" isDisabled={page <= 1} onPress={() => setPage(page - 1)}>
          上一页
        </Button>
        <Button size="sm" variant="ghost" isDisabled={page >= totalPages} onPress={() => setPage(page + 1)}>
          下一页
        </Button>
      </div>
    </div>
  );

  const applyFilters = () => {
    setAppliedTitle(titleInput);
    setPage(1);
  };
  const resetFilters = () => {
    setTitleInput("");
    setAppliedTitle("");
    setRequirementType("");
    setStatus("");
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="type-caption text-default-500">标题</span>
          <input
            className="rounded-sm border border-border bg-surface px-2 py-1.5 text-sm"
            value={titleInput}
            placeholder="回车搜索"
            onChange={(event) => setTitleInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyFilters();
            }}
          />
        </label>
        <OptionSelect
          label="类型"
          value={requirementType}
          options={toSelectOptions(options?.types ?? [])}
          onChange={(id) => {
            setRequirementType(id);
            setPage(1);
          }}
        />
        <OptionSelect
          label="状态"
          value={status}
          options={toSelectOptions(options?.statuses ?? [])}
          onChange={(id) => {
            setStatus(id);
            setPage(1);
          }}
        />
        <Button size="sm" onPress={applyFilters}>
          搜索
        </Button>
        <Button size="sm" variant="ghost" onPress={resetFilters}>
          重置
        </Button>
      </div>
      {matrixQuery.isPending ? (
        <div className="flex items-center gap-2 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载追溯矩阵…
        </div>
      ) : matrixQuery.isError ? (
        <div className="flex flex-col items-start gap-3">
          <p className="type-body text-danger">追溯矩阵加载失败：{toUserMessage(matrixQuery.error)}</p>
          <Button variant="ghost" onPress={() => void matrixQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : rows.length === 0 ? (
        // total === 0 才是真空；total > 0 但当前页无数据 = 越界空页（极短瞬态，
        // 上方 useEffect 会把 page 钳回最后一页），仍渲染分页器让用户可回。
        total === 0 ? (
          <EmptyHint>没有符合条件的需求。</EmptyHint>
        ) : (
          <>
            <EmptyHint>当前页没有数据，正在回到最后一页…</EmptyHint>
            {matrixPager}
          </>
        )
      ) : (
        <>
          <div className="overflow-hidden rounded-sm border border-border bg-surface">
            {rows.map((row) => (
              <div key={row.requirement.objectId} className="flex flex-col gap-1 border-b border-border px-3 py-3 last:border-b-0">
                <div className="flex items-center gap-2">
                  <Link
                    to="/p/$projectKey/requirements/$requirementId"
                    params={{ projectKey, requirementId: String(row.requirement.objectId) }}
                    className="type-body min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline"
                  >
                    {row.requirement.displayName}
                  </Link>
                  {row.requirement.status ? <StatusChip kind="requirement" status={row.requirement.status} /> : null}
                </div>
                <div className="type-caption flex flex-wrap gap-x-4 gap-y-1 text-default-500">
                  <span>任务 {row.taskSummaries.length}</span>
                  <span>用例 {row.testCaseSummaries.length}</span>
                  <span>缺陷 {row.defectSummaries.length}</span>
                  <span>
                    版本证据 {row.versionEvidence.total} 条
                    {row.versionEvidence.items.length > 0
                      ? `（${row.versionEvidence.items.map((item) => item.versionName).join("、")}${
                          row.versionEvidence.truncated ? "…" : ""
                        }）`
                      : ""}
                  </span>
                  {row.taskSummaries.length === 0 &&
                  row.testCaseSummaries.length === 0 &&
                  row.defectSummaries.length === 0 &&
                  // Codex review 4175472565：版本证据也是关联对象的一种——有版
                  // 本证据但无任务/用例/缺陷时，不能再报“无关联对象（覆盖缺口）”。
                  row.versionEvidence.total === 0 ? (
                    <span className="text-warning">无关联对象（覆盖缺口）</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {matrixPager}
        </>
      )}
    </div>
  );
}

function HierarchyTab({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const hierarchyQuery = useRequirementHierarchy(projectId);
  const list = hierarchyQuery.data ?? [];

  // 建树骨架：parentId → 直属子 id；根节点 = parentId 为空或父不在项目集合内。
  const { roots, childrenOf } = useMemo(() => {
    const ids = new Set(list.map((item) => item.id));
    const childrenOf = new Map<number, RequirementResponse[]>();
    const roots: RequirementResponse[] = [];
    for (const item of list) {
      if (item.parentId != null && ids.has(item.parentId)) {
        const siblings = childrenOf.get(item.parentId) ?? [];
        siblings.push(item);
        childrenOf.set(item.parentId, siblings);
      } else {
        roots.push(item);
      }
    }
    return { roots, childrenOf };
  }, [list]);

  if (hierarchyQuery.isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载需求层级…
      </div>
    );
  }
  if (hierarchyQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="type-body text-danger">需求层级加载失败：{toUserMessage(hierarchyQuery.error)}</p>
        <Button variant="ghost" onPress={() => void hierarchyQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (roots.length === 0) return <EmptyHint>这个项目还没有需求。</EmptyHint>;

  return (
    <div className="overflow-hidden rounded-sm border border-border bg-surface">
      {roots.map((root) => (
        <HierarchyNode key={root.id} node={root} childrenOf={childrenOf} projectKey={projectKey} depth={0} />
      ))}
    </div>
  );
}

function HierarchyNode({
  node,
  childrenOf,
  projectKey,
  depth,
}: {
  node: RequirementResponse;
  childrenOf: Map<number, RequirementResponse[]>;
  projectKey: string;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = (childrenOf.get(node.id)?.length ?? 0) > 0;
  // 展开时用 children 接口拉取权威直属子需求（hierarchy 骨架可能滞后）。
  const childrenQuery = useRequirementChildren(expanded && hasChildren ? node.id : null);

  return (
    <div>
      <div
        className={cn("flex items-center gap-2 border-b border-border px-3 py-2", depth === 0 && "bg-line/40")}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? "收起" : "展开"}
            className="type-caption w-4 shrink-0 text-default-500 hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Link
          to="/p/$projectKey/requirements/$requirementId"
          params={{ projectKey, requirementId: String(node.id) }}
          className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
        >
          {node.title}
        </Link>
        <span className="type-caption shrink-0 text-default-500">{node.requirementType}</span>
        <StatusChip kind="requirement" status={node.status} />
      </div>
      {expanded && hasChildren ? (
        childrenQuery.isPending ? (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-default-500" style={{ paddingLeft: 12 + (depth + 1) * 16 }}>
            <Spinner size="sm" />
            正在加载子需求…
          </div>
        ) : childrenQuery.isError ? (
          <p className="type-caption px-3 py-2 text-danger" style={{ paddingLeft: 12 + (depth + 1) * 16 }}>
            子需求加载失败：{toUserMessage(childrenQuery.error)}
          </p>
        ) : (
          (childrenQuery.data ?? []).map((child) => (
            <HierarchyNode key={child.id} node={child} childrenOf={childrenOf} projectKey={projectKey} depth={depth + 1} />
          ))
        )
      ) : null}
    </div>
  );
}
