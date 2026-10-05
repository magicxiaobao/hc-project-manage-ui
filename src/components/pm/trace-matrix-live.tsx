import { useEffect, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { PageHeading } from "@/components/biz";
import { useTraceMatrix, toUserMessage } from "@/lib/query";
import { MATRIX_PAGE_SIZE, matrixTotalPages, type MatrixFilters } from "@/lib/trace-matrix";
import { TraceMatrixFilters } from "./trace-matrix-filters";
import { TraceMatrixTable } from "./trace-matrix-table";

export function TraceMatrixLive({ projectId }: { projectId: number }) {
  const [filters, setFilters] = useState<MatrixFilters>({});
  const [page, setPage] = useState(1);
  const query = useTraceMatrix({ projectId, page, bean: filters });
  const total = query.data?.total ?? 0;
  const totalPages = matrixTotalPages(total);
  useEffect(() => {
    if (query.isSuccess && !query.isFetching && page > totalPages) setPage(totalPages);
  }, [query.isSuccess, query.isFetching, page, totalPages]);
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <PageHeading title="需求追溯矩阵" hint="每行一个需求，查看直接关联的任务、用例与缺陷。" />
      <TraceMatrixFilters
        filters={filters}
        onChange={(field, value) => {
          setFilters((current) => ({ ...current, [field]: value }));
          setPage(1);
        }}
        onReset={() => {
          setFilters({});
          setPage(1);
        }}
      />
      {query.isFetching ? (
        <div role="status" className="flex items-center gap-2">
          <Spinner size="sm" />
          正在加载矩阵…
        </div>
      ) : null}
      {query.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-danger">
          <p>
            矩阵加载失败：{toUserMessage(query.error)}
            {query.data ? "。数据为上次成功的结果。" : ""}
          </p>
          <Button variant="ghost" onPress={() => void query.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      {query.data ? (
        <>
          {!query.isError || query.data.list.length > 0 ? (
            <TraceMatrixTable rows={query.data.list} filters={filters} />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3" aria-label="矩阵分页">
            <span className="type-caption">
              共 {total} 条需求 · 第 {page} / {totalPages} 页 · 每页 {MATRIX_PAGE_SIZE} 条
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                isDisabled={query.isFetching || page <= 1}
                onPress={() => setPage((value) => value - 1)}
              >
                上一页
              </Button>
              <Button
                variant="ghost"
                isDisabled={query.isFetching || page >= totalPages}
                onPress={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
