import { useState } from "react";
import { Button } from "@heroui/react";
import { FieldError } from "@/components/biz/form-guard";
import { useStatisticsProjectOptions } from "@/lib/query/hooks/useProjectStats";
import {
  isDashboardPermissionDenied,
  normalizeCompareIds,
  projectName,
  validProjectId,
} from "@/lib/project-dashboard-data";
import { ProjectStatsError } from "./query-state";

export interface SelectedProject {
  id: number;
  name: string;
}
export function StatisticsProjectSelector({
  selected,
  onChange,
}: {
  selected: SelectedProject[];
  onChange: (value: SelectedProject[]) => void;
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const options = useStatisticsProjectOptions(
    { page, pageSize: 20, bean: search.trim() ? { projectName: search.trim() } : {} },
    open,
  );
  const data = isDashboardPermissionDenied(options.error) ? undefined : options.data;
  const metadataValid =
    data &&
    Number.isSafeInteger(data.total) &&
    data.total >= 0 &&
    validProjectId(data.pageNumber) &&
    validProjectId(data.pageSize);
  const pages = metadataValid ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const update = (next: SelectedProject[]) => {
    const normalized = normalizeCompareIds(next.map((item) => item.id));
    setSelectionError(normalized.error);
    if (!normalized.error) onChange(next);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onPress={() => setOpen((value) => !value)}>
          {open ? "收起项目选择器" : "展开项目选择器"}
        </Button>
        <Button variant="ghost" size="sm" onPress={() => update([])}>
          清空对比
        </Button>
      </div>
      <p>已选 {selected.length}/50 个项目</p>
      <ul className="flex flex-wrap gap-2">
        {selected.map((item) => (
          <li key={item.id}>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`移除 ${item.name} #${item.id}`}
              onPress={() => update(selected.filter((project) => project.id !== item.id))}
            >
              {item.name}（#{item.id}） ×
            </Button>
          </li>
        ))}
      </ul>
      <FieldError
        message={selectionError ?? normalizeCompareIds(selected.map((item) => item.id)).error}
      />
      {open ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            搜索项目名称
            <input
              aria-label="搜索项目名称"
              className="rounded border border-border bg-surface p-2"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          {options.isFetching ? (
            <p role="status">{data ? "正在更新候选项目…" : "正在加载候选项目…"}</p>
          ) : null}
          {options.isError ? (
            <ProjectStatsError
              area="候选项目"
              error={options.error}
              hasData={data !== undefined}
              retry={() => void options.refetch()}
            />
          ) : null}
          {data && !metadataValid ? <p role="alert">候选项目分页响应异常</p> : null}
          {data?.list.length === 0 ? (
            <p>{search.trim() ? "没有匹配项目" : "暂无可选择项目"}</p>
          ) : null}
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm">选择对比项目（最多 50 个）</legend>
            {data?.list.map((item, index) => (
              <label key={`${item.id}-${index}`} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label={`${projectName(item.projectName, item.id)} #${item.id}`}
                  checked={selected.some((project) => project.id === item.id)}
                  onChange={(event) =>
                    update(
                      event.target.checked
                        ? [
                            ...selected,
                            { id: item.id, name: projectName(item.projectName, item.id) },
                          ]
                        : selected.filter((project) => project.id !== item.id),
                    )
                  }
                />
                {projectName(item.projectName, item.id)}（#{item.id}）
                {!validProjectId(item.id) ? "（ID 无效）" : ""}
              </label>
            ))}
          </fieldset>
          {data && metadataValid ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                候选项目第 {data.pageNumber}/{pages} 页 · 共 {data.total} 个
              </span>
              <Button
                variant="ghost"
                size="sm"
                isDisabled={options.isFetching || data.pageNumber <= 1}
                onPress={() => setPage(data.pageNumber - 1)}
              >
                上一页候选
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isDisabled={options.isFetching || data.pageNumber >= pages}
                onPress={() => setPage(data.pageNumber + 1)}
              >
                下一页候选
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
