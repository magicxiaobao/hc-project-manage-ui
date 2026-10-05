import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { OptionSelect, type SelectOption } from "@/components/biz/option-select";
import { useProjectList, useTaskList, toUserMessage } from "@/lib/query";
import { useAuthStore } from "@/lib/api/auth-store";
import { validWorkLogId } from "@/lib/worklog-form";
export const workLogInputClass =
  "w-full rounded border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60";
export function WorkLogPager({
  page,
  pages,
  onChange,
  disabled = false,
  label = "记录",
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" isDisabled={disabled || page <= 1} onPress={() => onChange(page - 1)}>
        {label}上一页
      </Button>
      <span>
        {page} / {Math.max(1, pages)}
      </span>
      <Button
        variant="ghost"
        isDisabled={disabled || page >= pages}
        onPress={() => onChange(page + 1)}
      >
        {label}下一页
      </Button>
    </div>
  );
}
export function WorkLogProjectPicker({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  disabled: boolean;
}) {
  const [page, setPage] = useState(1);
  const query = useProjectList({ page, pageSize: 20 });
  const [selected, setSelected] = useState<SelectOption | null>(null);
  const options =
    query.data?.list.map((p) => ({
      id: String(p.id),
      label: `${p.projectName} (${p.projectKey})`,
    })) ?? [];
  useEffect(() => {
    const item = options.find((p) => p.id === String(value));
    if (item) setSelected(item);
  }, [query.data, value]);
  const retained =
    selected?.id === String(value) && !options.some((o) => o.id === selected.id)
      ? [selected, ...options]
      : options;
  return (
    <div>
      <label>项目</label>
      <OptionSelect
        label="项目"
        value={value == null ? "" : String(value)}
        options={[{ id: "", label: "请选择项目" }, ...retained]}
        isDisabled={disabled}
        onChange={(id) => onChange(id ? Number(id) : null)}
      />
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
        onChange={setPage}
        disabled={disabled}
      />
    </div>
  );
}
export function WorkLogTaskPicker({
  projectId,
  value,
  onChange,
  disabled,
  required = false,
}: {
  projectId: number | null;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const auth = useAuthStore((s) => s.isAuthenticated);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SelectOption | null>(null);
  const query = useTaskList({
    projectId: auth && validWorkLogId(projectId) ? projectId : null,
    page,
    pageSize: 20,
  });
  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [projectId]);
  const options =
    query.data?.list.map((t) => ({ id: String(t.id), label: `${t.title} (#${t.id})` })) ?? [];
  useEffect(() => {
    const item = options.find((t) => t.id === value);
    if (item) setSelected(item);
  }, [query.data, value]);
  if (value && !options.some((t) => t.id === value))
    options.unshift(selected?.id === value ? selected : { id: value, label: `任务 #${value}` });
  return (
    <>
      <OptionSelect
        label={`关联任务${required ? "（必填）" : ""}`}
        value={value}
        onChange={onChange}
        options={[{ id: "", label: required ? "请选择任务" : "不限制任务" }, ...options]}
        isDisabled={disabled || !validWorkLogId(projectId)}
      />
      {query.isLoading && projectId ? <p>正在加载任务…</p> : null}
      {query.isError ? (
        <p role="alert">
          任务加载失败：{toUserMessage(query.error)}
          <Button isDisabled={disabled} onPress={() => void query.refetch()}>
            重试任务
          </Button>
        </p>
      ) : null}
      <WorkLogPager
        label="任务"
        page={page}
        pages={Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize || 20))}
        onChange={setPage}
        disabled={disabled}
      />
    </>
  );
}
export function WorkLogBlockedFilters() {
  return (
    <>
      <fieldset disabled className="grid gap-2 sm:grid-cols-4">
        {["工作日期", "工期开始日期", "工期结束日期"].map((label) => (
          <label key={label}>
            {label}
            <input aria-label={label} type="date" className={workLogInputClass} />
          </label>
        ))}
        {["状态", "审批状态", "工作类型", "地点"].map((label) => (
          <label key={label}>
            {label}
            <select aria-label={label} className={workLogInputClass}>
              <option>暂不可用</option>
            </select>
          </label>
        ))}
      </fieldset>
      <p className="type-caption">日期和状态筛选暂不可用；审批状态、工作类型、地点筛选暂不可用。</p>
    </>
  );
}
