import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useUnsavedChangesGuard } from "@/components/biz/form-guard";
import { useAuthStore } from "@/lib/api/auth-store";
import { useWorkLogAnalytics, useWorkLogStatistics } from "@/lib/query";
import type { WorkLogAnalyticsRequest } from "@/lib/api/worklog-types";
import {
  analyticsDraftIdentity,
  defaultWorkLogAnalyticsDraft,
  validateWorkLogAnalyticsDraft,
  workLogAnalyticsSnapshot,
  workLogMonthRange,
  type AnalyticsField,
  type AnalyticsFieldError,
  type WorkLogAnalyticsDraft,
  type WorkLogAnalyticsView,
} from "@/lib/worklog-analytics-data";
import { WorkLogAnalyticsFilters, analyticsViewLabels } from "./worklog/worklog-analytics-filters";
import { WorkLogStatisticsPanel } from "./worklog/worklog-statistics-panel";
import { WorkLogAnalyticsOverview } from "./worklog/worklog-analytics-overview";

export function WorkLogAnalyticsPage() {
  const auth = useAuthStore((state) => state.isAuthenticated);
  const [draft, setDraft] = useState(defaultWorkLogAnalyticsDraft);
  const [baseline, setBaseline] = useState(draft);
  const [applied, setApplied] = useState<{
    view: WorkLogAnalyticsView;
    params: WorkLogAnalyticsRequest;
  } | null>(null);
  const [errors, setErrors] = useState<AnalyticsFieldError[]>([]);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    analyticsDraftIdentity(draft) !== analyticsDraftIdentity(baseline),
  );
  const params = applied?.params ?? null;
  const month = params ? { ...params, ...workLogMonthRange(clock) } : null;
  const dimension =
    applied?.view === "users" || applied?.view === "tasks" ? applied.view : "projects";
  const isAnalytics = applied?.view === "analytics";
  const rangeStats = useWorkLogStatistics(dimension, params, !!applied && !isAnalytics);
  const monthStats = useWorkLogStatistics(dimension, month, !!applied && !isAnalytics);
  const rangeAnalytics = useWorkLogAnalytics(params, !!applied && isAnalytics);
  const monthAnalytics = useWorkLogAnalytics(month, !!applied && isAnalytics);
  const edit = <K extends AnalyticsField>(field: K, value: WorkLogAnalyticsDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) =>
      current.filter(
        (error) =>
          error.field !== field &&
          !(
            field === "startDate" &&
            error.field === "endDate" &&
            error.message === "结束日期不能早于开始日期"
          ) &&
          !(field === "view" && (error.field === "userIds" || error.field === "taskIds")),
      ),
    );
  };
  const apply = () => {
    const nextErrors = validateWorkLogAnalyticsDraft(draft);
    setErrors(nextErrors);
    if (nextErrors.length) {
      document.getElementById(`analytics-${nextErrors[0].field}`)?.focus();
      return;
    }
    const snapshot = workLogAnalyticsSnapshot(draft);
    setClock(new Date());
    setApplied({ view: draft.view, params: snapshot });
    setBaseline({ ...draft, projectIds: [...draft.projectIds] });
    markClean();
  };
  return (
    <main className="grid gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="type-title">工时统计分析</h1>
        <Link to="/worklogs" className="text-accent underline">
          返回工时列表
        </Link>
      </div>
      {!auth ? (
        <p>
          请登录后查看工时统计分析。<Link to="/login">登录</Link>
        </p>
      ) : null}
      <WorkLogAnalyticsFilters
        draft={draft}
        errors={errors}
        authenticated={auth}
        onEdit={edit}
        onApply={apply}
        onRestore={() =>
          guard(() => {
            setDraft({ ...baseline, projectIds: [...baseline.projectIds] });
            setErrors([]);
          })
        }
        onMonth={() => {
          const next = workLogMonthRange();
          setDraft((current) => ({ ...current, ...next }));
          setErrors((current) =>
            current.filter((error) => error.field !== "startDate" && error.field !== "endDate"),
          );
        }}
      />
      {auth && applied ? (
        <section className="grid gap-4" aria-label="已应用统计结果">
          <h2>{analyticsViewLabels[applied.view]} · 已应用范围</h2>
          <p>
            {params!.startDate} 至 {params!.endDate} · 项目 ID：{params!.projectIds!.join(", ")}
            {params!.userIds?.length ? ` · 用户 ID：${params!.userIds.join(", ")}` : ""}
            {params!.taskIds?.length ? ` · 任务 ID：${params!.taskIds.join(", ")}` : ""}
          </p>
          <p>
            本月口径：{month!.startDate} 至 {month!.endDate}
          </p>
          {isAnalytics ? (
            <WorkLogAnalyticsOverview range={rangeAnalytics} month={monthAnalytics} />
          ) : (
            <WorkLogStatisticsPanel
              key={JSON.stringify(applied)}
              dimension={dimension}
              range={rangeStats}
              month={monthStats}
            />
          )}
        </section>
      ) : auth ? (
        <p>请选择项目后查询</p>
      ) : null}
      <p>日期范围列表查询尚未提供，当前无法与工时列表按相同日期范围对账。</p>
      <section className="grid gap-2">
        <h2>待联调专项与详情</h2>
        {[
          ["专项趋势", "POST workLog/v1/analytics/trend"],
          ["专项效率", "POST workLog/v1/analytics/efficiency"],
          ["专项协作", "POST workLog/v1/analytics/collaboration"],
          ["单项目详情", "GET workLog/v1/statistics/project/{projectId}"],
          ["单用户详情", "GET workLog/v1/statistics/user/{userId}"],
          ["单任务详情（不支持当前自选日期范围）", "GET workLog/v1/statistics/task/{taskId}"],
        ].map(([label, path]) => (
          <p key={path}>
            {label}（{path}）：数据暂未提供，待后端联调确认。
          </p>
        ))}
      </section>
      <p>报表导出暂不可用</p>
      {dialog}
      {blocker}
    </main>
  );
}
