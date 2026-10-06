import { useRef, useState } from "react";
import { Button } from "@heroui/react";
import { FieldError, RequiredMark } from "@/components/biz/form-guard";
import { useProjectList, toUserMessage } from "@/lib/query";
import { validProjectId } from "@/lib/project-dashboard-data";
import type {
  AnalyticsField,
  AnalyticsFieldError,
  WorkLogAnalyticsDraft,
  WorkLogAnalyticsView,
} from "@/lib/worklog-analytics-data";
import { WorkLogPager, workLogInputClass } from "./worklog-list-controls";

export const analyticsViewLabels: Record<WorkLogAnalyticsView, string> = {
  projects: "项目统计",
  users: "用户统计",
  tasks: "任务统计",
  analytics: "综合分析",
};
function ProjectCollection({
  ids,
  onChange,
  error,
  disabled,
}: {
  ids: number[];
  onChange: (ids: number[]) => void;
  error?: string;
  disabled: boolean;
}) {
  const [page, setPage] = useState(1);
  const query = useProjectList({ page, pageSize: 20 });
  // 选过的名称跨选项页保留；当前选项页不是全部项目。
  const names = useRef(new Map<number, string>());
  for (const project of query.data?.list ?? [])
    names.current.set(project.id, `${project.projectName} (${project.projectKey})`);
  return (
    <div>
      <label htmlFor="analytics-projectIds">
        项目集合
        <RequiredMark />
      </label>
      <select
        id="analytics-projectIds"
        aria-label="项目集合"
        required={ids.length === 0}
        aria-invalid={!!error}
        aria-describedby="analytics-projectIds-error"
        className={workLogInputClass}
        value=""
        disabled={disabled}
        aria-busy={query.isLoading}
        onChange={(event) => {
          if (query.isError || query.isLoading) return;
          const id = Number(event.target.value);
          if (validProjectId(id)) onChange([...new Set([...ids, id])]);
        }}
      >
        <option value="">选择项目并添加到集合</option>
        {(query.data?.list ?? []).map((project) => (
          <option
            key={project.id}
            value={project.id}
            disabled={
              query.isError ||
              query.isLoading ||
              !validProjectId(project.id) ||
              ids.includes(project.id)
            }
          >
            {names.current.get(project.id)}
          </option>
        ))}
      </select>
      <div id="analytics-projectIds-error">
        <FieldError message={error} />
      </div>
      <ul className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <li key={id}>
            {names.current.get(id) ?? `项目 #${id}`}{" "}
            <Button
              isDisabled={disabled}
              onPress={() => onChange(ids.filter((value) => value !== id))}
            >
              移除项目 #{id}
            </Button>
          </li>
        ))}
      </ul>
      {query.isLoading ? <p>正在加载项目…</p> : null}
      {query.isError ? (
        <p role="alert">
          项目加载失败：{toUserMessage(query.error)}
          <Button onPress={() => void query.refetch()}>重试项目</Button>
        </p>
      ) : null}
      <WorkLogPager
        label="项目"
        page={page}
        pages={Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize || 20))}
        disabled={disabled}
        onChange={setPage}
      />
    </div>
  );
}
export function WorkLogAnalyticsFilters({
  draft,
  errors,
  authenticated,
  onEdit,
  onApply,
  onRestore,
  onMonth,
}: {
  draft: WorkLogAnalyticsDraft;
  errors: AnalyticsFieldError[];
  authenticated: boolean;
  onEdit: <K extends AnalyticsField>(field: K, value: WorkLogAnalyticsDraft[K]) => void;
  onApply: () => void;
  onRestore: () => void;
  onMonth: () => void;
}) {
  const message = (field: AnalyticsField) => errors.find((error) => error.field === field)?.message;
  const optional = draft.view === "users" ? "userIds" : draft.view === "tasks" ? "taskIds" : null;
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (authenticated) onApply();
      }}
      className="grid gap-4 rounded border border-border p-4"
    >
      <fieldset disabled={!authenticated} className="grid gap-4 sm:grid-cols-2">
        {(["startDate", "endDate"] as const).map((field) => (
          <div key={field}>
            <label htmlFor={`analytics-${field}`}>
              {field === "startDate" ? "开始日期" : "结束日期"}
              <RequiredMark />
            </label>
            <input
              id={`analytics-${field}`}
              type="date"
              required
              className={workLogInputClass}
              value={draft[field]}
              aria-invalid={!!message(field)}
              aria-describedby={`analytics-${field}-error`}
              onChange={(event) => onEdit(field, event.target.value)}
            />
            <div id={`analytics-${field}-error`}>
              <FieldError message={message(field)} />
            </div>
          </div>
        ))}
        <div>
          <label htmlFor="analytics-view">统计视图</label>
          <select
            id="analytics-view"
            className={workLogInputClass}
            value={draft.view}
            onChange={(event) => onEdit("view", event.target.value as WorkLogAnalyticsView)}
          >
            {Object.entries(analyticsViewLabels).map(([view, label]) => (
              <option key={view} value={view}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {optional ? (
          <div>
            <label htmlFor={`analytics-${optional}`}>
              {optional === "userIds" ? "用户 ID 集合" : "任务 ID 集合"}
            </label>
            <input
              id={`analytics-${optional}`}
              className={workLogInputClass}
              value={draft[optional]}
              aria-invalid={!!message(optional)}
              aria-describedby={`analytics-${optional}-error analytics-id-help`}
              onChange={(event) => onEdit(optional, event.target.value)}
            />
            <div id={`analytics-${optional}-error`}>
              <FieldError message={message(optional)} />
            </div>
            <p id="analytics-id-help">
              逗号分隔；留空为全部，仅作用于当前{optional === "userIds" ? "用户" : "任务"}统计视图。
            </p>
          </div>
        ) : (
          <p>当前视图只按项目集合与日期范围查询。</p>
        )}
      </fieldset>
      {authenticated ? (
        <ProjectCollection
          ids={draft.projectIds}
          error={message("projectIds")}
          disabled={false}
          onChange={(ids) => onEdit("projectIds", ids)}
        />
      ) : (
        <p>请登录后选择项目与查询。</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" isDisabled={!authenticated}>
          应用筛选
        </Button>
        <Button isDisabled={!authenticated} onPress={onMonth}>
          本月
        </Button>
        <Button onPress={onRestore}>恢复已应用筛选</Button>
      </div>
    </form>
  );
}
