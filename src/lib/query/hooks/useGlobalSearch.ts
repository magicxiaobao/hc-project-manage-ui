import {
  CancelledError,
  queryOptions,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useAuthStore } from "../../api/auth-store";
import { ApiBusinessError } from "../../api/client";
import { projectApi } from "../../api/project";
import { taskApi } from "../../api/task";
import { defectApi } from "../../api/defect";
import { requirementApi } from "../../api/requirement";
import { testCaseApi } from "../../api/testCase";
import type { ProjectResponse, PageResult } from "../../api/types";
import type { TaskResponse } from "../../api/task-types";
import type { DefectResponse } from "../../api/defect-types";
import type { RequirementResponse } from "../../api/requirement-types";
import type { TestCaseResponse } from "../../api/testCase-types";
import { queryKeys } from "../keys";
import {
  normalizeSearchKeyword,
  searchKeywordError,
  SEARCH_DOMAINS,
  type SearchDomain,
} from "../../search/keyword";

export const SEARCH_PREVIEW_SIZE = 10;
/** 全局搜索（未指定项目）时最多扇出的项目数，防止 4×N 请求爆炸。 */
export const MAX_GLOBAL_SEARCH_PROJECTS = 20;
export type SearchProject = Pick<ProjectResponse, "id" | "projectKey" | "projectName">;
export type SearchRecord = TaskResponse | DefectResponse | RequirementResponse | TestCaseResponse;
const cancelled = () => new CancelledError({ revert: true, silent: true });
function checkSignal(signal?: AbortSignal) {
  if (signal?.aborted) throw cancelled();
}
export function compareSearchProjects(a: SearchProject, b: SearchProject) {
  return (a.projectKey < b.projectKey ? -1 : a.projectKey > b.projectKey ? 1 : 0) || a.id - b.id;
}

/** 完整枚举才发布 data；任意页失败不会把此前的页当作完整范围。 */
export async function enumerateSearchProjects(signal?: AbortSignal): Promise<SearchProject[]> {
  const projects = new Map<number, SearchProject>();
  for (let page = 1; ; page++) {
    checkSignal(signal);
    const result = await projectApi.findByPage({ page, pageSize: 100, bean: {} });
    checkSignal(signal);
    for (const item of result.list) {
      if (
        Number.isSafeInteger(item.id) &&
        item.id > 0 &&
        typeof item.projectKey === "string" &&
        /^[A-Za-z0-9_-]+$/.test(item.projectKey)
      ) {
        projects.set(item.id, {
          id: item.id,
          projectKey: item.projectKey,
          projectName: item.projectName,
        });
      }
    }
    if (!result.list.length || result.pageNumber * result.pageSize >= result.total) break;
  }
  return [...projects.values()].sort(compareSearchProjects);
}
export function visibleSearchProjectsOptions() {
  return queryOptions({
    queryKey: queryKeys.project.searchScope(),
    queryFn: ({ signal }) => enumerateSearchProjects(signal),
  });
}

/** 在途计数包含已取消订阅但 HTTP 尚未结束的请求，跨关键词/范围也不突破 4。 */
class SearchRequestQueue {
  private active = 0;
  private waiting: Array<() => void> = [];
  run<T>(signal: AbortSignal, request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        this.waiting = this.waiting.filter((job) => job !== start);
        reject(cancelled());
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) {
          reject(cancelled());
          return;
        }
        this.active++;
        // query signal 只取消排队/订阅，既有 API 不接受外部 fetch signal。
        Promise.resolve()
          .then(() => {
            checkSignal(signal);
            return request();
          })
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.drain();
          });
      };
      if (signal.aborted) {
        reject(cancelled());
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      this.waiting.push(start);
      this.drain();
    });
  }
  private drain() {
    while (this.active < 4 && this.waiting.length) this.waiting.shift()!();
  }
}
const queues = new WeakMap<QueryClient, SearchRequestQueue>();
function queueFor(client: QueryClient) {
  let queue = queues.get(client);
  if (!queue) {
    queue = new SearchRequestQueue();
    queues.set(client, queue);
  }
  return queue;
}
const apis = {
  task: taskApi,
  defect: defectApi,
  requirement: requirementApi,
  testCase: testCaseApi,
};
export type SearchProjectResult = {
  project: SearchProject;
  data: PageResult<SearchRecord> | undefined;
  pending: boolean;
  failed: boolean;
  error: Error | null;
  retry: () => void;
};
export type SearchDomainResult = {
  state: "pending" | "success" | "partial" | "error";
  projects: SearchProjectResult[];
  total: number;
  completed: number;
  rows: { project: SearchProject; item: SearchRecord }[];
};

export function useGlobalSearch(keywordValue: unknown, projectKey?: string) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.userId);
  const client = useQueryClient();
  const keyword = normalizeSearchKeyword(keywordValue);
  const error = searchKeywordError(keywordValue);
  const scope = useQuery({ ...visibleSearchProjectsOptions(), enabled: isAuthenticated });
  const allProjects = scope.isSuccess
    ? (scope.data ?? []).filter(
        (project) => projectKey === undefined || project.projectKey === projectKey,
      )
    : [];
  // 未指定项目时做全局搜索：限制项目数以避免 4×N 请求扇出。
  const truncated = projectKey === undefined && allProjects.length > MAX_GLOBAL_SEARCH_PROJECTS;
  const projects = truncated ? allProjects.slice(0, MAX_GLOBAL_SEARCH_PROJECTS) : allProjects;
  const unavailable = scope.isSuccess && projectKey !== undefined && !projects.length;
  const enabled =
    isAuthenticated &&
    !!keyword &&
    !error &&
    scope.isSuccess &&
    projects.length > 0 &&
    !unavailable;
  const descriptors = enabled
    ? projects.flatMap((project) => SEARCH_DOMAINS.map((domain) => ({ project, domain })))
    : [];
  const queries = useQueries({
    queries: descriptors.map(({ project, domain }) => {
      const params = {
        page: 1,
        pageSize: SEARCH_PREVIEW_SIZE,
        bean: { projectId: project.id, title: keyword },
      };
      return {
        queryKey: queryKeys[domain].list(params),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          queueFor(client).run(signal, async (): Promise<PageResult<SearchRecord>> => {
            const auth = useAuthStore.getState();
            if (!auth.isAuthenticated || auth.user?.userId !== userId) throw cancelled();
            const data = await apis[domain].findByPage(params);
            if (data.list.some((item) => item.projectId != null && item.projectId !== project.id)) {
              throw new ApiBusinessError({
                code: -1,
                msg: "搜索响应的项目与查询范围不符。",
                result: null,
              });
            }
            return data;
          }),
      };
    }),
  });
  const domains = Object.fromEntries(
    SEARCH_DOMAINS.map((domain) => {
      const results: SearchProjectResult[] = [];
      descriptors.forEach((descriptor, index) => {
        if (descriptor.domain !== domain) return;
        const query = queries[index];
        results.push({
          project: descriptor.project,
          data: query.data,
          pending: query.isPending || query.isFetching,
          failed: query.isError,
          error: query.error,
          retry: () => {
            void query.refetch();
          },
        });
      });
      const failed = results.filter((result) => result.failed).length;
      const pending = results.some((result) => result.pending);
      const seen = new Set<string>();
      const rows = results
        .flatMap((result) =>
          (result.data?.list ?? []).map((item) => ({ project: result.project, item })),
        )
        .filter((row) => {
          const key = `${domain}:${row.project.id}:${row.item.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, SEARCH_PREVIEW_SIZE);
      const state = pending
        ? "pending"
        : failed === results.length && failed > 0
          ? "error"
          : failed > 0
            ? "partial"
            : "success";
      return [
        domain,
        {
          state,
          projects: results,
          total: results
            .filter((result) => !result.failed)
            .reduce((sum, result) => sum + (result.data?.total ?? 0), 0),
          completed: results.filter((result) => !result.pending).length,
          rows,
        } satisfies SearchDomainResult,
      ];
    }),
  ) as Record<SearchDomain, SearchDomainResult>;
  return { keyword, error, isAuthenticated, scope, projects, unavailable, enabled, domains, truncated };
}
