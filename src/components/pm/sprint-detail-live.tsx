/**
 * 冲刺详情（P3：p3-sprint-detail）。
 *
 * /p/$projectKey/sprints/$sprintId，对标老前端
 * views/sprint/components/SprintDetail.vue（燃尽图 + 冲刺回顾 Tab）。
 * ⚠️ 老前端的"统计" Tab 走 GET sprint/v1/statistics/{sprintId}，该端点是
 * Controller TODO 空壳（返回 Map.of()），P3 明确排除不迁移；
 * 燃尽图走 GET sprint/v1/burndownChart/{id}（后端真实实现）。
 *
 * 结构：
 * - 头部：返回按钮 + 冲刺名称 + 状态 chip（sprintStatusLabel 口径沿用列表页）
 * - 基本信息卡：GET /sprint/v1/findById/{id}（SprintResponse），含故事点进度
 * - Tabs：燃尽图（SVG 自绘折线+理想线+工时柱，不引重型图表库）/ 冲刺回顾
 *
 * 回顾编辑器表单 UX 约定：
 * - dirty check：useUnsavedChangesGuard(draft !== savedText)，blocker 与
 *   dialog 在页面顶层渲染（early return 分支之上，守卫不离线）；
 *   返回按钮走 guard 包裹；保存成功先 markClean() 再更新基线
 * - 回顾非必填：后端 retrospective_summary 为 TEXT 列，无长度/格式约束，
 *   故无字段级校验（约定中的"如有校验"不适用）
 *
 * 登录态由路由层守卫（未登录渲染 EmptyHint）；本组件只处理已登录分支。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Label, ProgressBar, Spinner, Tabs, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  EmptyHint,
  Loading,
  PageHeading,
  StateChip,
  useUnsavedChangesGuard,
} from "@/components/biz";
import type { StateTone } from "@/components/biz/state-tone";
import {
  isSprintStatus,
  sprintCompletionRate,
  sprintDurationText,
  sprintStatusLabel,
  type SprintStatus,
} from "@/lib/sprint-form";
import {
  buildBurndownGeometry,
  normalizeBurndownData,
  summarizeBurndown,
} from "@/lib/sprint-detail";
import type { SprintResponse } from "@/lib/api/sprint-types";
import {
  toUserMessage,
  useSprintBurndown,
  useSprintDetail,
  useSprintRetrospective,
  useUpdateRetrospective,
} from "@/lib/query";

const STATUS_TONES: Record<SprintStatus, StateTone> = {
  PLANNING: "neutral",
  ACTIVE: "progress",
  COMPLETED: "done",
  CANCELLED: "danger",
};

const BURNDOWN_SIZE = {
  width: 720,
  height: 340,
  padding: { top: 16, right: 52, bottom: 30, left: 48 },
};

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="type-caption text-default-500">{label}</dt>
      <dd className="type-body mt-0.5 break-words">{children}</dd>
    </div>
  );
}

/**
 * 燃尽图 Tab：GET /sprint/v1/burndownChart/{id} → SVG 自绘。
 * totalPoints/completedPoints 取冲刺详情统计（r16-5）；缺失时图注改用
 * "首日剩余/区间消耗"诚实口径，绝不拿首日剩余冒充"总故事点"。
 */
function BurndownPanel({
  sprintId,
  totalPoints,
  completedPoints,
}: {
  sprintId: number;
  totalPoints?: number | null;
  completedPoints?: number | null;
}) {
  const query = useSprintBurndown(sprintId);
  if (query.isPending) {
    return <Loading variant="section" label="正在加载燃尽图…" />;
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 py-8">
        <p className="type-body text-danger">燃尽图加载失败：{toUserMessage(query.error)}</p>
        <Button variant="ghost" onPress={() => void query.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  const normalized = normalizeBurndownData(query.data);
  const geometry = buildBurndownGeometry(normalized, BURNDOWN_SIZE);
  if (!geometry) {
    // 后端冲刺不存在时返回空 Map 会落到这里；但此时详情查询一般已先报
    // NotFind。能走到这里通常是冲刺无计划日期/无任务。
    return <EmptyHint>暂无燃尽图数据：冲刺可能没有计划日期或任务。</EmptyHint>;
  }
  const summary = summarizeBurndown(normalized, { totalPoints, completedPoints });
  const { padding } = BURNDOWN_SIZE;
  const remainingEnd = normalized.values[normalized.values.length - 1] ?? 0;
  return (
    <figure>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          role="img"
          aria-label={`燃尽图：剩余故事点从 ${summary.firstDayRemaining} 降至 ${remainingEnd}，累计工时 ${summary.totalHours} 小时`}
          className="w-full min-w-[560px]"
        >
          {/* 左轴网格 + 刻度（剩余故事点） */}
          {geometry.leftTicks.map((tick) => (
            <g key={`left-${tick.label}`}>
              <line
                x1={padding.left}
                x2={geometry.width - padding.right}
                y1={tick.y}
                y2={tick.y}
                strokeWidth={1}
                strokeDasharray="3 3"
                className="stroke-default-200"
              />
              <text
                x={padding.left - 8}
                y={tick.y + 4}
                textAnchor="end"
                fontSize={11}
                className="fill-default-500"
              >
                {tick.label}
              </text>
            </g>
          ))}
          {/* 右轴刻度（工时） */}
          {geometry.rightTicks.map((tick) => (
            <text
              key={`right-${tick.label}`}
              x={geometry.width - padding.right + 8}
              y={tick.y + 4}
              fontSize={11}
              className="fill-default-400"
            >
              {tick.label}
            </text>
          ))}
          {/* 每日工时柱（右轴） */}
          {geometry.bars.map((bar) => (
            <rect
              key={bar.date}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={2}
              className="fill-warning/40"
            >
              <title>{`${bar.date}：工时 ${bar.hours} 小时`}</title>
            </rect>
          ))}
          {/* 理想线：首日剩余 → 0 */}
          <polyline
            points={geometry.idealPoints}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            className="stroke-default-400"
          />
          {/* 剩余故事点折线 */}
          <polyline
            points={geometry.linePoints}
            fill="none"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-primary"
          />
          {geometry.dots.map((dot) => (
            <circle
              key={dot.date}
              cx={dot.x}
              cy={dot.y}
              r={3.5}
              strokeWidth={1.5}
              className="fill-primary stroke-background"
            >
              <title>{`${dot.date}：剩余 ${dot.value} 故事点`}</title>
            </circle>
          ))}
          {/* 横轴日期 */}
          {geometry.xLabels.map((label) => (
            <text
              key={label.label}
              x={label.x}
              y={geometry.height - 8}
              textAnchor="middle"
              fontSize={11}
              className="fill-default-500"
            >
              {label.label}
            </text>
          ))}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 bg-primary" />
          剩余故事点（左轴）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-6 border-t-2 border-dashed border-default-400" />
          理想线
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-warning/40" />
          每日工时（右轴）
        </span>
        <span className="ml-auto">
          {summary.totalPoints != null ? (
            <>
              总故事点 {summary.totalPoints} · 已完成 {summary.completedPoints ?? 0} ·{" "}
            </>
          ) : (
            <>
              首日剩余 {summary.firstDayRemaining} · 区间消耗 {summary.windowCompleted} ·{" "}
            </>
          )}
          累计工时 {summary.totalHours} 小时
        </span>
      </figcaption>
    </figure>
  );
}

type DetailTab = "burndown" | "retrospective";

export function SprintDetailLive({
  sprintId,
  projectKey,
}: {
  sprintId: number;
  projectKey: string;
}) {
  const navigate = useNavigate();
  const detail = useSprintDetail(sprintId);
  const retro = useSprintRetrospective(sprintId);
  const updateRetro = useUpdateRetrospective();
  const [tab, setTab] = useState<DetailTab>("burndown");

  // 回顾编辑器状态：draft=null 表示尚未从服务端载入；savedText 为上次
  // 载入/保存的基线；dirty = 草稿偏离基线。
  const serverText = retro.data ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [savedText, setSavedText] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  // 已同步为草稿/基线的服务端文本版本。后台重取返回新文本时：草稿不脏
  // 才用新文本重设基线（r16-2）；脏草稿一律保留，避免静默覆盖用户输入。
  const syncedServerTextRef = useRef<string | null>(null);
  useEffect(() => {
    if (!retro.isSuccess) return;
    const isDirty = draft !== null && savedText !== null && draft !== savedText;
    if (draft === null || (!isDirty && serverText !== syncedServerTextRef.current)) {
      syncedServerTextRef.current = serverText;
      setDraft(serverText);
      setSavedText(serverText);
    }
  }, [retro.isSuccess, serverText, draft, savedText]);
  const dirty = draft !== null && savedText !== null && draft !== savedText;
  // 整页表单守卫：blocker/dialog 必须在 early return 分支之上渲染，
  // 否则加载页/错误页切换时守卫离线（表单 UX 约定）。
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(dirty);

  const back = () => {
    guard(() => {
      markClean();
      void navigate({ to: "/p/$projectKey/sprints", params: { projectKey } });
    });
  };

  const handleSave = () => {
    if (draft === null || updateRetro.isPending) return;
    setSubmitError("");
    updateRetro.mutate(
      { sprintId, retrospective: draft },
      {
        onSuccess: () => {
          toast.success("冲刺回顾已保存");
          // 成功 = 已授权离开：同步置位 cleanRef，避免守卫拦截后续导航
          markClean();
          setSavedText(draft);
        },
        onError: (error) => {
          setSubmitError(`保存失败：${toUserMessage(error)}`);
        },
      },
    );
  };

  return (
    <>
      {blocker}
      {dialog}
      {detail.isPending ? (
        <div className="p-4 md:p-6">
          <Loading variant="section" label="正在加载冲刺详情…" />
        </div>
      ) : detail.isError ? (
        <div className="flex flex-col items-start gap-3 p-4 md:p-6">
          <p className="type-body text-danger">冲刺详情加载失败：{toUserMessage(detail.error)}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onPress={() => void detail.refetch()}>
              重试
            </Button>
            <Button variant="ghost" onPress={back}>
              返回冲刺列表
            </Button>
          </div>
        </div>
      ) : detail.data == null ? (
        <div className="p-4 md:p-6">
          <EmptyHint>没有找到这个冲刺（可能已被删除）。</EmptyHint>
        </div>
      ) : (
        <DetailBody
          sprint={detail.data}
          sprintId={sprintId}
          tab={tab}
          onTabChange={setTab}
          onBack={back}
          draft={draft}
          onDraftChange={(value) => {
            setDraft(value);
            setSubmitError("");
          }}
          retroPending={retro.isPending}
          retroError={retro.isError ? toUserMessage(retro.error) : null}
          onRetroRetry={() => void retro.refetch()}
          dirty={dirty}
          saving={updateRetro.isPending}
          submitError={submitError}
          onSave={handleSave}
        />
      )}
    </>
  );
}

function DetailBody({
  sprint,
  sprintId,
  tab,
  onTabChange,
  onBack,
  draft,
  onDraftChange,
  retroPending,
  retroError,
  onRetroRetry,
  dirty,
  saving,
  submitError,
  onSave,
}: {
  sprint: SprintResponse;
  sprintId: number;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onBack: () => void;
  draft: string | null;
  onDraftChange: (value: string) => void;
  retroPending: boolean;
  retroError: string | null;
  onRetroRetry: () => void;
  dirty: boolean;
  saving: boolean;
  submitError: string;
  onSave: () => void;
}) {
  const status = sprint.status;
  const tone: StateTone = isSprintStatus(status) ? STATUS_TONES[status] : "neutral";
  const totalPoints = sprint.totalStoryPoints ?? 0;
  const completedPoints = sprint.completedStoryPoints ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onPress={onBack}>
          ← 返回冲刺列表
        </Button>
        <PageHeading
          title={sprint.sprintName}
          hint={
            sprint.sprintNumber
              ? `编号 ${sprint.sprintNumber} · 计划 ${sprintDurationText(sprint)}`
              : `计划 ${sprintDurationText(sprint)}`
          }
        />
        <span className="ml-auto">
          <StateChip tone={tone}>{sprintStatusLabel(status, sprint.statusLabel)}</StateChip>
        </span>
      </div>

      <section
        aria-label="基本信息"
        className="rounded-lg border border-default-200 bg-content1 p-4"
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          <InfoItem label="状态">{sprintStatusLabel(status, sprint.statusLabel)}</InfoItem>
          <InfoItem label="冲刺编号">{sprint.sprintNumber ?? "—"}</InfoItem>
          <InfoItem label="计划开始">{sprint.plannedStartDate?.slice(0, 10) ?? "—"}</InfoItem>
          <InfoItem label="计划结束">{sprint.plannedEndDate?.slice(0, 10) ?? "—"}</InfoItem>
          <InfoItem label="实际开始">{sprint.actualStartDate?.slice(0, 10) ?? "—"}</InfoItem>
          <InfoItem label="实际结束">{sprint.actualEndDate?.slice(0, 10) ?? "—"}</InfoItem>
          <InfoItem label="Scrum Master">
            {sprint.scrumMasterId != null ? `用户 #${sprint.scrumMasterId}` : "—"}
          </InfoItem>
          <InfoItem label="产品负责人">
            {sprint.productOwnerId != null ? `用户 #${sprint.productOwnerId}` : "—"}
          </InfoItem>
          <InfoItem label="团队规模">{sprint.teamSize ?? "—"}</InfoItem>
          <InfoItem label="容量（人天）">{sprint.capacity ?? "—"}</InfoItem>
        </dl>
        {sprint.sprintGoal ? (
          <div className="mt-3 border-t border-default-200 pt-3">
            <InfoItem label="冲刺目标">{sprint.sprintGoal}</InfoItem>
          </div>
        ) : null}
        {sprint.totalStoryPoints != null ? (
          <div className="mt-3 border-t border-default-200 pt-3">
            <ProgressBar
              aria-label="故事点完成进度"
              value={sprintCompletionRate(sprint)}
              minValue={0}
              maxValue={100}
              size="sm"
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <p className="type-caption mt-1 text-default-500">
              故事点 {completedPoints}/{totalPoints} 已完成（{sprintCompletionRate(sprint)}%）
            </p>
          </div>
        ) : null}
      </section>

      <Tabs selectedKey={tab} onSelectionChange={(key) => onTabChange(String(key) as DetailTab)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="冲刺详情">
            <Tabs.Tab id="burndown">
              燃尽图
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="retrospective">
              冲刺回顾
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="burndown">
          <BurndownPanel
            sprintId={sprintId}
            totalPoints={sprint.totalStoryPoints}
            completedPoints={sprint.completedStoryPoints}
          />
        </Tabs.Panel>
        <Tabs.Panel id="retrospective">
          {/* 错误判定必须在 loading 之前：首次 GET 失败时 isPending=false
              但 draft 仍为 null，原顺序恒命中 loading 使错误/重试不可达（r16-1） */}
          {retroError ? (
            <div className="flex flex-col items-start gap-3 py-8">
              <p className="type-body text-danger">冲刺回顾加载失败：{retroError}</p>
              <Button variant="ghost" onPress={onRetroRetry}>
                重试
              </Button>
            </div>
          ) : retroPending || draft === null ? (
            <Loading variant="section" label="正在加载冲刺回顾…" />
          ) : (
            <div className="flex max-w-3xl flex-col gap-3">
              <TextField value={draft} onChange={onDraftChange} isDisabled={saving}>
                <Label>冲刺回顾</Label>
                <TextArea
                  rows={8}
                  placeholder="记录本冲刺做得好的地方、待改进的事项和后续行动项…"
                />
              </TextField>
              {submitError ? (
                <p role="alert" className="text-sm text-danger">
                  {submitError}
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                <Button variant="primary" onPress={onSave} isDisabled={saving || !dirty}>
                  {saving ? <Spinner size="sm" /> : null}
                  保存回顾
                </Button>
                {dirty ? (
                  <span className="type-caption text-warning">有未保存的修改</span>
                ) : (
                  <span className="type-caption text-default-400">已保存</span>
                )}
              </div>
              <p className="type-caption text-default-500">
                离开本页前若有未保存的修改，会先弹出"是否放弃修改？"确认框。
              </p>
            </div>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
