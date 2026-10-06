import { Button } from "@heroui/react";
import { toUserMessage } from "@/lib/query/error";
export interface WorkbenchQueryState {
  data?: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  dataUpdatedAt: number;
  refetch: () => Promise<unknown>;
}
export function WorkbenchCardFeedback({
  query,
  label,
}: {
  query: WorkbenchQueryState;
  label: string;
}) {
  return (
    <>
      {query.isPending && query.isFetching ? <p role="status">{label}正在加载…</p> : null}
      {query.isFetching && query.data !== undefined ? (
        <p role="status">{label}正在刷新，显示上次结果…</p>
      ) : null}
      {query.isError ? (
        <div role="alert" className="rounded border border-danger p-2 text-danger">
          <p>
            {label}
            {query.data !== undefined ? "旧数据，刷新失败：" : "加载失败："}
            {toUserMessage(query.error)}
          </p>
          {query.data !== undefined && query.dataUpdatedAt > 0 ? (
            <p>
              更新时间：{new Date(query.dataUpdatedAt).toLocaleString("zh-CN", { hour12: false })}
            </p>
          ) : null}
          <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
            重试{label}
          </Button>
        </div>
      ) : null}
    </>
  );
}
