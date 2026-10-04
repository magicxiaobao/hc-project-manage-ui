/**
 * 缺陷详情（P2：p2-defect-detail-flow）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 详情：GET /defect/v1/findById/{id}
 * - 状态流转：按 DEFECT_TRANSITIONS_BY_STATUS 渲染目标按钮
 *   （忠实于后端 DefectStateMachineConfig 拓扑，老前端 DEFECT_TRANSITIONS_BY_STATUS
 *   镜像一致；非法流转由后端状态机拒绝并经 toUserMessage 展示），
 *   执行 POST /defect/v1/updateStatus；指派边（→ASSIGNED/→NEW）必需处理人 ID，
 *   →TESTING 必需测试人 ID，→VERIFIED 必需验证人 ID，
 *   →REJECTED/→REOPEN/→CLOSED/→PENDING_VERIFICATION/→RESOLVED
 *   以及 TESTING→IN_PROGRESS（返回开发）必需原因（最长 500 字符）
 * - 编辑：POST /defect/v1/updateDefect（严重度与状态流转不在此入口）
 * - 严重度重定级：POST /defect/v1/{defectId}/severity（CAS 命令，
 *   expectedSeverity 为当前已读取值，原因必填 1～500 字符）
 *
 * 评论线程不在此页接线：老前端缺陷页面未接 comment/v1，为 P2 明确排除项。
 *
 * 后端日期说明：foundDate/estimatedFixDate/actualFixDate/closedDate 为 LocalDateTime
 * （'YYYY-MM-DDTHH:mm:ss' 字符串，不做时区换算）；createdAt/updatedAt 为秒级时间戳。
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Input, Label, Spinner, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  OptionSelect,
  PageHeading,
  PriorityMark,
  SeverityChip,
  StatusChip,
} from "@/components/biz";
import { severityLabel } from "@/components/biz/severity";
import { priorityLabel, statusLabel } from "@/lib/pm/domain";
import { parseOptionalPositiveInt } from "@/lib/task-create";
import {
  defectNeedsActor,
  defectNeedsReason,
  defectTransitionLabel,
  defectTransitionTargets,
  toUserMessage,
  useChangeDefectSeverity,
  useDefectDetail,
  useProjectIdByKey,
  useUpdateDefect,
  useUpdateDefectStatus,
} from "@/lib/query";
import type { DefectActorField } from "@/lib/query";
import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
} from "@/lib/api/defect-types";
import type {
  DefectResponse,
  DefectSeverity,
  DefectStatus,
  DefectTransitionPayload,
} from "@/lib/api/defect-types";

const REASON_MAX_LENGTH = 500;
const SEVERITY_REASON_MAX_LENGTH = 500;

const SEVERITY_OPTIONS = DEFECT_SEVERITIES.map((severity) => ({
  id: severity,
  label: severityLabel(severity),
}));

const PRIORITY_OPTIONS = DEFECT_PRIORITIES.map((priority) => ({
  id: priority,
  label: priorityLabel(priority),
}));

const ACTOR_FIELD_LABELS: Record<DefectActorField, string> = {
  assignee: "处理人用户 ID",
  tester: "测试人用户 ID",
  verifier: "验证人用户 ID",
};

/** 后端 createdAt/updatedAt 为秒级时间戳，转本地时间展示 */
function formatEpochSecond(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

/** 后端 LocalDateTime 'YYYY-MM-DDTHH:mm:ss'，直接展示不做时区换算 */
function formatLocalDateTime(value: string | null | undefined): string {
  if (value == null || value === "") return "-";
  return value.replace("T", " ");
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-default-500">{label}</dt>
      <dd className="type-body mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (value == null || value === "") {
    return <p className="type-caption text-default-500">暂无{label}。</p>;
  }
  return (
    <div>
      <h3 className="type-emphasis mb-1">{label}</h3>
      <p className="type-body whitespace-pre-wrap rounded-sm border border-border bg-surface p-4">
        {value}
      </p>
    </div>
  );
}

interface DefectEditForm {
  title: string;
  description: string;
  defectType: string;
  priority: string;
  reporterId: string;
  foundDate: string;
  estimatedFixDate: string;
  reproductionSteps: string;
  expectedResult: string;
  actualResult: string;
  environment: string;
  attachments: string;
  tags: string;
}

function editFormFrom(detail: DefectResponse): DefectEditForm {
  return {
    title: detail.title ?? "",
    description: detail.description ?? "",
    defectType: detail.defectType ?? "",
    priority: detail.priority ?? "",
    reporterId: detail.reporterId != null ? String(detail.reporterId) : "",
    foundDate: detail.foundDate ?? "",
    estimatedFixDate: detail.estimatedFixDate ?? "",
    reproductionSteps: detail.reproductionSteps ?? "",
    expectedResult: detail.expectedResult ?? "",
    actualResult: detail.actualResult ?? "",
    environment: detail.environment ?? "",
    attachments: detail.attachments ?? "",
    tags: detail.tags ?? "",
  };
}

export function DefectDetailLive({
  defectId,
  projectKey,
}: {
  defectId: number;
  projectKey: string;
}) {
  const detailQuery = useDefectDetail(defectId);
  const detail = detailQuery.data ?? null;
  // TaskDetailLive 的同类守卫（Codex review 4175265694）：路由里的 projectKey
  // 必须解析出项目并与记录的 projectId 一致，否则跨项目链接会在错误的项目
  // 上下文里展示并允许操作其它项目的缺陷。解析中/解析失败时不误判。
  const routeProjectQuery = useProjectIdByKey(projectKey);

  const transitionMutation = useUpdateDefectStatus();
  const updateMutation = useUpdateDefect();
  const severityMutation = useChangeDefectSeverity();

  const [transitionTarget, setTransitionTarget] = useState<DefectStatus | null>(null);
  const [reason, setReason] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<DefectEditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [severityOpen, setSeverityOpen] = useState(false);
  const [targetSeverity, setTargetSeverity] = useState<string>("");
  const [severityReason, setSeverityReason] = useState("");
  const [severityError, setSeverityError] = useState<string | null>(null);

  const statusLabelOf = (value: string) => statusLabel("defect", value);

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载缺陷详情…
      </div>
    );
  }
  if (detailQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">缺陷详情加载失败：{toUserMessage(detailQuery.error)}</p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (!detail) {
    return <EmptyHint>{`没有找到这个缺陷（id=${defectId}）。`}</EmptyHint>;
  }

  const routeProjectId = routeProjectQuery.data;
  if (
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId !== routeProjectId
  ) {
    return (
      <EmptyHint>{`缺陷 #${defectId} 不属于当前项目（/p/${projectKey}），请检查链接。`}</EmptyHint>
    );
  }
  // 写操作区（状态流转/编辑/严重度）只有在路由项目解析成功且与记录的
  // projectId 精确一致时才渲染。解析中/解析失败时只读展示。
  const projectContextVerified =
    typeof routeProjectId === "number" &&
    detail.projectId != null &&
    detail.projectId === routeProjectId;
  const projectContextNotice = routeProjectQuery.isPending
    ? "正在确认项目归属，操作区稍后可用…"
    : "当前无法确认该记录归属于此项目，操作区已禁用。";

  const targets = defectTransitionTargets(detail.status);
  const transitionActor = transitionTarget != null ? defectNeedsActor(transitionTarget) : null;
  const transitionReasonRequired =
    transitionTarget != null && defectNeedsReason(detail.status, transitionTarget);

  const openTransition = (toStatus: DefectStatus) => {
    transitionMutation.reset();
    setTransitionTarget(toStatus);
    setReason("");
    setActorInput("");
    setTransitionError(null);
  };

  const submitTransition = () => {
    if (transitionTarget == null) return;
    if (transitionMutation.isPending) return;
    const payload: DefectTransitionPayload = { id: defectId, status: transitionTarget };

    const trimmedReason = reason.trim();
    if (transitionReasonRequired && !trimmedReason) {
      setTransitionError("请填写流转原因。");
      return;
    }
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      setTransitionError(`流转原因不能超过 ${REASON_MAX_LENGTH} 字符。`);
      return;
    }
    if (trimmedReason) payload.reason = trimmedReason;

    if (transitionActor != null) {
      const parsed = parseOptionalPositiveInt(actorInput);
      if (parsed == null) {
        setTransitionError(`请填写${ACTOR_FIELD_LABELS[transitionActor]}（正整数）。`);
        return;
      }
      if (transitionActor === "assignee") payload.assigneeId = parsed;
      else if (transitionActor === "tester") payload.testerId = parsed;
      else payload.verifierId = parsed;
    }

    setTransitionError(null);
    transitionMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(`缺陷已流转到${defectTransitionLabel(detail.status, transitionTarget, statusLabelOf)}`);
        setTransitionTarget(null);
      },
      onError: (error) => {
        setTransitionError(`流转失败：${toUserMessage(error)}`);
      },
    });
  };

  const openEdit = () => {
    updateMutation.reset();
    setEditForm(editFormFrom(detail));
    setEditError(null);
    setEditOpen(true);
  };

  const submitEdit = () => {
    if (editForm == null || updateMutation.isPending) return;
    const title = editForm.title.trim();
    if (!title) {
      setEditError("标题不能为空。");
      return;
    }
    if (title.length > 200) {
      setEditError("标题不能超过 200 字符（DB VARCHAR(200)）。");
      return;
    }
    const reporterId = parseOptionalPositiveInt(editForm.reporterId);
    if (editForm.reporterId.trim() !== "" && reporterId == null) {
      setEditError("报告人用户 ID 格式非法，请输入正整数或留空。");
      return;
    }
    const noneEmpty = (value: string) => {
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    };
    setEditError(null);
    updateMutation.mutate(
      {
        id: defectId,
        title,
        description: noneEmpty(editForm.description),
        defectType: noneEmpty(editForm.defectType),
        priority: (editForm.priority || undefined) as DefectResponse["priority"] | undefined,
        reporterId,
        foundDate: noneEmpty(editForm.foundDate),
        estimatedFixDate: noneEmpty(editForm.estimatedFixDate),
        reproductionSteps: noneEmpty(editForm.reproductionSteps),
        expectedResult: noneEmpty(editForm.expectedResult),
        actualResult: noneEmpty(editForm.actualResult),
        environment: noneEmpty(editForm.environment),
        attachments: noneEmpty(editForm.attachments),
        tags: noneEmpty(editForm.tags),
      },
      {
        onSuccess: () => {
          toast.success("缺陷已更新");
          setEditOpen(false);
        },
        onError: (error) => {
          setEditError(`更新失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  const openSeverity = () => {
    severityMutation.reset();
    setTargetSeverity(detail.severity);
    setSeverityReason("");
    setSeverityError(null);
    setSeverityOpen(true);
  };

  const submitSeverity = () => {
    if (severityMutation.isPending) return;
    if (targetSeverity === detail.severity) {
      setSeverityError("目标严重度与当前一致，无需变更。");
      return;
    }
    const trimmedReason = severityReason.trim();
    if (!trimmedReason) {
      setSeverityError("请填写重定级原因（后端要求 1～500 字符）。");
      return;
    }
    if (trimmedReason.length > SEVERITY_REASON_MAX_LENGTH) {
      setSeverityError(`重定级原因不能超过 ${SEVERITY_REASON_MAX_LENGTH} 字符。`);
      return;
    }
    setSeverityError(null);
    severityMutation.mutate(
      {
        defectId,
        data: {
          expectedSeverity: detail.severity,
          targetSeverity: targetSeverity as DefectSeverity,
          reason: trimmedReason,
        },
      },
      {
        onSuccess: () => {
          toast.success(`严重度已变更为${severityLabel(targetSeverity)}`);
          setSeverityOpen(false);
        },
        onError: (error) => {
          setSeverityError(`变更失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          to="/p/$projectKey/defects"
          params={{ projectKey }}
          className="type-caption text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回缺陷列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PageHeading
            title={detail.title}
            hint={`缺陷 #${detail.id} · 真实后端数据（GET /defect/v1/findById）。`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {detail.defectType ? (
            <span className="type-caption rounded-sm border border-border px-2 py-0.5">
              {detail.defectType}
            </span>
          ) : null}
          <SeverityChip severity={detail.severity} />
          <PriorityMark priority={detail.priority} />
          <StatusChip kind="defect" status={detail.status} />
          {detail.statusLabel ? (
            <span className="type-caption text-default-500">{detail.statusLabel}</span>
          ) : null}
        </div>
      </div>

      <section aria-label="基本信息">
        <h2 className="type-emphasis mb-2">基本信息</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
          <MetaItem label="处理人 ID" value={detail.assigneeId != null ? String(detail.assigneeId) : "-"} />
          <MetaItem label="报告人 ID" value={detail.reporterId != null ? String(detail.reporterId) : "-"} />
          <MetaItem label="测试人 ID" value={detail.testerId != null ? String(detail.testerId) : "-"} />
          <MetaItem label="严重度" value={severityLabel(detail.severity)} />
          <MetaItem label="优先级" value={priorityLabel(detail.priority)} />
          <MetaItem label="发现日期" value={formatLocalDateTime(detail.foundDate)} />
          <MetaItem label="预计修复日期" value={formatLocalDateTime(detail.estimatedFixDate)} />
          <MetaItem label="实际修复日期" value={formatLocalDateTime(detail.actualFixDate)} />
          <MetaItem label="关闭日期" value={formatLocalDateTime(detail.closedDate)} />
          <MetaItem label="环境" value={detail.environment ?? "-"} />
          <MetaItem label="标签" value={detail.tags ?? "-"} />
          <MetaItem label="所属项目 ID" value={detail.projectId != null ? String(detail.projectId) : "-"} />
          <MetaItem label="创建时间" value={formatEpochSecond(detail.createdAt)} />
          <MetaItem label="更新时间" value={formatEpochSecond(detail.updatedAt)} />
        </dl>
      </section>

      <section aria-label="描述与复现信息" className="flex flex-col gap-4">
        <TextBlock label="描述" value={detail.description} />
        <TextBlock label="复现步骤" value={detail.reproductionSteps} />
        <TextBlock label="期望结果" value={detail.expectedResult} />
        <TextBlock label="实际结果" value={detail.actualResult} />
      </section>

      {projectContextVerified ? (
        <>
          <section aria-label="状态流转">
            <h2 className="type-emphasis mb-2">状态流转</h2>
            {targets.length === 0 ? (
              <p className="type-caption text-default-500">
                当前状态（{statusLabelOf(detail.status)}）无可用流转。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {targets.map((toStatus) => (
                  <Button
                    key={toStatus}
                    size="sm"
                    variant="primary"
                    isDisabled={transitionMutation.isPending}
                    onPress={() => openTransition(toStatus)}
                  >
                    {defectTransitionLabel(detail.status, toStatus, statusLabelOf)}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section aria-label="编辑与严重度">
            <h2 className="type-emphasis mb-2">编辑</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onPress={openEdit}>
                编辑缺陷
              </Button>
              <Button size="sm" variant="ghost" onPress={openSeverity}>
                重定严重度
              </Button>
            </div>
          </section>
        </>
      ) : (
        <p className="type-body rounded-sm border border-border bg-surface px-3 py-2 text-default-500">
          {projectContextNotice}
        </p>
      )}

      <AppModal
        open={transitionTarget != null}
        title={
          transitionTarget != null
            ? `流转到${defectTransitionLabel(detail.status, transitionTarget, statusLabelOf)}`
            : "状态流转"
        }
        size="md"
        onClose={() => {
          if (!transitionMutation.isPending) setTransitionTarget(null);
        }}
      >
        {transitionTarget != null ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitTransition();
            }}
          >
            {transitionActor != null ? (
              <TextField value={actorInput} onChange={setActorInput} aria-label={ACTOR_FIELD_LABELS[transitionActor]}>
                <Label>{ACTOR_FIELD_LABELS[transitionActor]}（必填，无对应人员无法完成流转）</Label>
                <Input placeholder="输入用户 ID（正整数）" inputMode="numeric" />
              </TextField>
            ) : null}
            <TextField value={reason} onChange={setReason} aria-label="流转原因">
              <Label>{transitionReasonRequired ? "流转原因（必填，最长 500 字符）" : "流转原因（可选，最长 500 字符）"}</Label>
              <TextArea rows={3} placeholder="为什么流转…" />
            </TextField>
            {transitionError ? <p className="type-body text-danger">{transitionError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onPress={() => setTransitionTarget(null)}
                isDisabled={transitionMutation.isPending}
              >
                取消
              </Button>
              <Button type="submit" variant="primary" isDisabled={transitionMutation.isPending}>
                {transitionMutation.isPending ? "流转中…" : "确认流转"}
              </Button>
            </div>
          </form>
        ) : null}
      </AppModal>

      <AppModal
        open={editOpen}
        title="编辑缺陷"
        size="lg"
        onClose={() => {
          if (!updateMutation.isPending) setEditOpen(false);
        }}
      >
        {editForm != null ? (
          <div className="flex flex-col gap-4">
            <TextField value={editForm.title} onChange={(next) => setEditForm({ ...editForm, title: next })} aria-label="标题">
              <Label>标题（必填）</Label>
              <Input placeholder="缺陷标题" />
            </TextField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField value={editForm.defectType} onChange={(next) => setEditForm({ ...editForm, defectType: next })} aria-label="缺陷类型">
                <Label>类型</Label>
                <Input placeholder="如 功能/界面/性能" />
              </TextField>
              <OptionSelect
                label="优先级"
                value={editForm.priority}
                options={[{ id: "", label: "请选择" }, ...PRIORITY_OPTIONS]}
                onChange={(next) => setEditForm({ ...editForm, priority: next })}
              />
              <TextField value={editForm.reporterId} onChange={(next) => setEditForm({ ...editForm, reporterId: next })} aria-label="报告人用户 ID">
                <Label>报告人用户 ID</Label>
                <Input placeholder="正整数，留空则清空" inputMode="numeric" />
              </TextField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField value={editForm.foundDate} onChange={(next) => setEditForm({ ...editForm, foundDate: next })} aria-label="发现日期">
                <Label>发现日期</Label>
                <Input placeholder="YYYY-MM-DDTHH:mm:ss" />
              </TextField>
              <TextField value={editForm.estimatedFixDate} onChange={(next) => setEditForm({ ...editForm, estimatedFixDate: next })} aria-label="预计修复日期">
                <Label>预计修复日期</Label>
                <Input placeholder="YYYY-MM-DDTHH:mm:ss" />
              </TextField>
            </div>
            <TextField value={editForm.description} onChange={(next) => setEditForm({ ...editForm, description: next })} aria-label="描述">
              <Label>描述</Label>
              <TextArea rows={3} placeholder="缺陷描述" />
            </TextField>
            <TextField value={editForm.reproductionSteps} onChange={(next) => setEditForm({ ...editForm, reproductionSteps: next })} aria-label="复现步骤">
              <Label>复现步骤</Label>
              <TextArea rows={3} placeholder="一步一步说明如何复现" />
            </TextField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField value={editForm.expectedResult} onChange={(next) => setEditForm({ ...editForm, expectedResult: next })} aria-label="期望结果">
                <Label>期望结果</Label>
                <TextArea rows={2} placeholder="期望的行为" />
              </TextField>
              <TextField value={editForm.actualResult} onChange={(next) => setEditForm({ ...editForm, actualResult: next })} aria-label="实际结果">
                <Label>实际结果</Label>
                <TextArea rows={2} placeholder="实际发生的行为" />
              </TextField>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField value={editForm.environment} onChange={(next) => setEditForm({ ...editForm, environment: next })} aria-label="环境">
                <Label>环境</Label>
                <Input placeholder="如 Chrome 130 / Windows 11" />
              </TextField>
              <TextField value={editForm.tags} onChange={(next) => setEditForm({ ...editForm, tags: next })} aria-label="标签">
                <Label>标签</Label>
                <Input placeholder="逗号分隔" />
              </TextField>
            </div>
            <p className="type-caption text-default-500">
              说明：严重度请走「重定严重度」CAS 入口，状态请走上方「状态流转」——此处不允许直接改。
            </p>
            {editError ? <p className="type-body text-danger">{editError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onPress={() => setEditOpen(false)} isDisabled={updateMutation.isPending}>
                取消
              </Button>
              <Button variant="primary" onPress={submitEdit} isDisabled={updateMutation.isPending}>
                {updateMutation.isPending ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        ) : null}
      </AppModal>

      <AppModal
        open={severityOpen}
        title="重定严重度"
        size="md"
        onClose={() => {
          if (!severityMutation.isPending) setSeverityOpen(false);
        }}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitSeverity();
          }}
        >
          <p className="type-body text-default-500">
            当前严重度：<span className="type-emphasis">{severityLabel(detail.severity)}</span>。
            重定级为 CAS 命令（远端已变更时会失败，请刷新后重试）。
          </p>
          <OptionSelect
            label="目标严重度"
            value={targetSeverity}
            options={SEVERITY_OPTIONS}
            onChange={setTargetSeverity}
          />
          <TextField value={severityReason} onChange={setSeverityReason} aria-label="重定级原因">
            <Label>重定级原因（必填，1～500 字符）</Label>
            <TextArea rows={3} placeholder="为什么调整严重度…" />
          </TextField>
          {severityError ? <p className="type-body text-danger">{severityError}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onPress={() => setSeverityOpen(false)}
              isDisabled={severityMutation.isPending}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" isDisabled={severityMutation.isPending}>
              {severityMutation.isPending ? "提交中…" : "确认重定"}
            </Button>
          </div>
        </form>
      </AppModal>
    </div>
  );
}
