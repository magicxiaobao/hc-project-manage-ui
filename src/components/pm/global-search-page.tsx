import { Button, Spinner, Tabs } from "@heroui/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useGlobalSearch } from "@/lib/query/hooks/useGlobalSearch";
import { toUserMessage } from "@/lib/query/error";
import {
  SEARCH_DOMAINS,
  SEARCH_LABELS,
  type GlobalSearchParams,
  type SearchDomain,
} from "@/lib/search/keyword";
import { useGlobalSearchDraft } from "./global-search-draft";
import { SearchDomainPanel } from "./search-domain-panel";

export function GlobalSearchPage({ search }: { search: GlobalSearchParams }) {
  const result = useGlobalSearch(search.keyword, search.projectKey);
  const navigate = useNavigate();
  const { waiting } = useGlobalSearchDraft();
  const tab = search.tab ?? "task";
  const allComplete =
    result.enabled && SEARCH_DOMAINS.every((domain) => result.domains[domain].state === "success");
  const allFailed =
    result.enabled && SEARCH_DOMAINS.every((domain) => result.domains[domain].state === "error");
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <h1 className="type-title">全局搜索</h1>
      <p className="type-body">
        按标题搜索任务、缺陷、需求、测试用例。{result.keyword ? `关键词：${result.keyword}` : ""}
      </p>
      {!result.isAuthenticated ? (
        <p>
          请先
          <Link to="/login" className="underline">
            登录
          </Link>
          后搜索。
        </p>
      ) : (
        <>
          <label className="flex flex-wrap items-center gap-2">
            搜索范围
            <select
              className="min-w-0 rounded-sm border border-border bg-surface p-2"
              aria-label="搜索范围"
              value={result.unavailable ? "__unavailable__" : (search.projectKey ?? "")}
              onChange={(event) => {
                void navigate({
                  to: "/search",
                  search: { ...search, projectKey: event.target.value || undefined },
                });
              }}
            >
              <option value="">全部可见的未归档项目</option>
              {result.unavailable ? (
                <option value="__unavailable__" disabled>
                  范围不可用（{search.projectKey}）
                </option>
              ) : null}
              {(result.scope.data ?? []).map((project) => (
                <option key={project.id} value={project.projectKey}>
                  {project.projectName}（{project.projectKey}）
                </option>
              ))}
            </select>
          </label>
          <p className="type-meta">
            当前范围：
            {search.projectKey === undefined
              ? "全部可见的未归档项目"
              : (result.projects[0]?.projectName ?? `范围不可用（${search.projectKey}）`)}
          </p>
          {result.error ? (
            <p role="alert" className="text-danger">
              {result.error}
            </p>
          ) : null}
          {!result.keyword ? <p>输入关键词搜索</p> : null}
          {result.scope.isPending ? (
            <p role="status">
              <Spinner size="sm" />
              正在加载搜索范围…
            </p>
          ) : null}
          {result.scope.isError ? (
            <div role="alert">
              范围加载失败：{toUserMessage(result.scope.error)}{" "}
              <Button
                variant="ghost"
                onPress={() => {
                  void result.scope.refetch();
                }}
              >
                重试范围
              </Button>
            </div>
          ) : null}
          {result.unavailable ? (
            <p role="alert">所选项目不可见、已归档或不存在，搜索范围不可用。</p>
          ) : result.scope.isSuccess && !result.projects.length ? (
            <p>无可搜索项目。</p>
          ) : null}
          {waiting ? <p role="status">等待搜索</p> : null}
          {allFailed ? <p role="alert">四个域均查询失败，请分别重试。</p> : null}
          {allComplete && SEARCH_DOMAINS.every((domain) => result.domains[domain].total === 0) ? (
            <p>未找到相关结果。</p>
          ) : null}
          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => {
              void navigate({
                to: "/search",
                search: { ...search, tab: key as SearchDomain },
                replace: true,
              });
            }}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="搜索类型">
                {SEARCH_DOMAINS.map((domain) => (
                  <Tabs.Tab key={domain} id={domain}>
                    {SEARCH_LABELS[domain]}
                    {result.enabled
                      ? ` · ${result.domains[domain].state === "success" ? "" : "已查询 "}${result.domains[domain].total}`
                      : ""}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
            {SEARCH_DOMAINS.map((domain) => (
              <Tabs.Panel key={domain} id={domain}>
                {result.enabled ? (
                  <SearchDomainPanel
                    domain={domain}
                    result={result.domains[domain]}
                    keyword={result.keyword}
                    waiting={waiting}
                    singleProject={search.projectKey !== undefined}
                  />
                ) : null}
              </Tabs.Panel>
            ))}
          </Tabs>
        </>
      )}
    </div>
  );
}
