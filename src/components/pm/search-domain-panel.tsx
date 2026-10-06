import { Bone } from "@/components/biz/skeleton";
import { Button, Spinner } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/query/error";
import type { SearchDomainResult } from "@/lib/query/hooks/useGlobalSearch";
import { SEARCH_LABELS, type SearchDomain } from "@/lib/search/keyword";
import { SearchResultRow } from "./search-result-row";

export function SearchDomainPanel({
  domain,
  result,
  keyword,
  waiting,
  singleProject,
}: {
  domain: SearchDomain;
  result: SearchDomainResult;
  keyword: string;
  waiting: boolean;
  singleProject: boolean;
}) {
  const complete = result.state === "success";
  return (
    <section className="flex flex-col gap-3 py-4" aria-label={`${SEARCH_LABELS[domain]}搜索结果`}>
      <p aria-live="polite" className="type-body">
        {waiting
          ? "等待搜索"
          : `${complete ? "共" : "已查询命中数"} ${result.total} 条 · 已完成 ${result.completed}/${result.projects.length} 个项目`}
      </p>
      {result.state === "pending" ? (
        <>
          <div className="flex items-center gap-2" role="status">
            <Spinner size="sm" />
            正在查询{SEARCH_LABELS[domain]}…
          </div>
          <div aria-hidden="true" className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Bone key={index} className="h-10 w-full" />
            ))}
          </div>
        </>
      ) : null}
      {result.state === "error" ? <p role="alert">{SEARCH_LABELS[domain]}查询失败。</p> : null}
      {complete && result.total === 0 ? <p>未找到相关{SEARCH_LABELS[domain]}。</p> : null}
      {result.rows.length ? (
        <>
          <p className="type-meta">限量预览，最多 10 条；按项目标识排序，项目内沿用接口顺序。</p>
          <ul
            className={
              waiting
                ? "rounded-sm border border-border opacity-50"
                : "rounded-sm border border-border bg-surface"
            }
          >
            {result.rows.map(({ project, item }) => (
              <SearchResultRow
                key={`${domain}:${project.id}:${item.id}`}
                domain={domain}
                project={project}
                item={item}
                disabled={waiting}
              />
            ))}
          </ul>
        </>
      ) : null}
      {result.projects
        .filter((project) => project.failed)
        .map((project) => (
          <div
            key={project.project.id}
            role="alert"
            className="flex flex-wrap items-center gap-3 text-danger"
          >
            <span>
              {project.project.projectName}：
              {project.data ? "上次成功结果，刷新失败。" : "查询失败。"}
              {toUserMessage(project.error)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={waiting || project.pending}
              onPress={project.retry}
            >
              重试（{project.project.projectName}）
            </Button>
          </div>
        ))}
      <div className="flex flex-wrap gap-4">
        {result.projects
          .filter(
            (project) =>
              !project.failed && project.data && (singleProject || project.data.total > 0),
          )
          .map(({ project }) => {
            const label = singleProject ? "查看全部" : `查看全部（${project.projectName}）`;
            const search = { keyword };
            return (
              <span key={project.id} className="type-body underline">
                {waiting ? (
                  <span aria-disabled="true">{label}</span>
                ) : domain === "task" ? (
                  <Link
                    to="/p/$projectKey/issues"
                    params={{ projectKey: project.projectKey }}
                    search={search}
                  >
                    {label}
                  </Link>
                ) : domain === "defect" ? (
                  <Link
                    to="/p/$projectKey/defects"
                    params={{ projectKey: project.projectKey }}
                    search={search}
                  >
                    {label}
                  </Link>
                ) : domain === "requirement" ? (
                  <Link
                    to="/p/$projectKey/requirements"
                    params={{ projectKey: project.projectKey }}
                    search={search}
                  >
                    {label}
                  </Link>
                ) : (
                  <Link
                    to="/p/$projectKey/testcases"
                    params={{ projectKey: project.projectKey }}
                    search={search}
                  >
                    {label}
                  </Link>
                )}
              </span>
            );
          })}
      </div>
    </section>
  );
}
