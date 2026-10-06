import { useEffect, useState } from "react";
import {
  CancelledError,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useAuthStore } from "../../api/auth-store";
import { taskApi } from "../../api/task";
import { workLogApi } from "../../api/worklog";
import { visibleSearchProjectsOptions } from "./useGlobalSearch";
import { queryKeys } from "../keys";
import {
  WORKBENCH_STATUSES,
  workbenchDates,
  workbenchUserId,
  workbenchTaskParams,
  validateWorkbenchTasks,
  summarizeWorkbenchTasks,
} from "../../workbench-data";

const cancelled = () => new CancelledError({ revert: true, silent: true });
function checkAccount(userId: number | null, signal?: AbortSignal) {
  const auth = useAuthStore.getState();
  if (
    signal?.aborted ||
    userId === null ||
    !auth.isAuthenticated ||
    workbenchUserId(auth.user?.userId) !== userId
  )
    throw cancelled();
}
/** 在途 HTTP 结束才释放槽位；取消的排队请求不启动，跨日期/范围/账户也最多 4。 */
class WorkbenchTaskQueue {
  private active = 0;
  private waiting: Array<() => void> = [];
  run<T>(signal: AbortSignal, userId: number, request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.waiting = this.waiting.filter((job) => job !== start);
        reject(cancelled());
      };
      const start = () => {
        signal.removeEventListener("abort", abort);
        try {
          checkAccount(userId, signal);
        } catch (error) {
          reject(error);
          return;
        }
        this.active++;
        Promise.resolve()
          .then(() => {
            checkAccount(userId, signal);
            return request();
          })
          .then((data) => {
            checkAccount(userId, signal);
            resolve(data);
          }, reject)
          .catch(reject)
          .finally(() => {
            this.active--;
            this.drain();
          });
      };
      try {
        checkAccount(userId, signal);
      } catch (error) {
        reject(error);
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
const queues = new WeakMap<QueryClient, WorkbenchTaskQueue>();
function queueFor(client: QueryClient) {
  let queue = queues.get(client);
  if (!queue) {
    queue = new WorkbenchTaskQueue();
    queues.set(client, queue);
  }
  return queue;
}
/** 计时器只检查本地日期；日期不变不会触发网络请求。 */
export function useWorkbenchDates() {
  const [dates, setDates] = useState(() => workbenchDates());
  useEffect(() => {
    const update = () => {
      const next = workbenchDates();
      setDates((previous) =>
        previous.today === next.today && previous.weekStart === next.weekStart ? previous : next,
      );
    };
    update();
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return dates;
}
export function useWorkbench() {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const rawId = useAuthStore((s) => s.user?.userId);
  const userId = authenticated ? workbenchUserId(rawId) : null;
  const client = useQueryClient();
  const dates = useWorkbenchDates();
  const options = visibleSearchProjectsOptions();
  const scope = useQuery({
    ...options,
    enabled: userId !== null,
    staleTime: 30_000,
    queryFn: async (context) => {
      checkAccount(userId, context.signal);
      const data = await options.queryFn!(context);
      checkAccount(userId, context.signal);
      return data;
    },
  });
  // 刷新失败可以展示旧完整范围；禁止以旧范围继续启动新的聚合请求。
  const projects = userId !== null ? (scope.data ?? []) : [];
  const projectIds = [...new Set(projects.map((project) => project.id))].sort((a, b) => a - b);
  const enabled = userId !== null && scope.isSuccess && projectIds.length > 0;
  const descriptors =
    userId !== null
      ? projects.flatMap((project) => WORKBENCH_STATUSES.map((status) => ({ project, status })))
      : [];
  const queries = useQueries({
    queries: descriptors.map(({ project, status }) => {
      const params = workbenchTaskParams(project.id, userId!, status);
      return {
        queryKey: queryKeys.task.list(params),
        enabled,
        staleTime: 30_000,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          queueFor(client).run(signal, userId!, async () =>
            validateWorkbenchTasks(await taskApi.findByPage(params), project.id, userId!, status),
          ),
        select: (data: Awaited<ReturnType<typeof taskApi.findByPage>>) =>
          validateWorkbenchTasks(data, project.id, userId!, status),
      };
    }),
  });
  const groups = descriptors.map((descriptor, i) => ({ ...queries[i], ...descriptor }));
  const summary = summarizeWorkbenchTasks(groups);
  const hoursOptions = (startDate: string) => {
    const params = { userId, startDate, endDate: dates.today, projectIds };
    return {
      queryKey: queryKeys.workLog.userStatistics(params),
      enabled,
      staleTime: 30_000,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        checkAccount(userId, signal);
        if (!projectIds.length || !scope.isSuccess) throw new Error("暂无可统计项目");
        const data = await workLogApi.getUserStatistics(userId!, {
          startDate,
          endDate: dates.today,
          projectIds,
        });
        checkAccount(userId, signal);
        return data;
      },
    };
  };
  // 周一的两个 observer 使用同一 key，React Query 合并请求。
  const today = useQuery(hoursOptions(dates.today));
  const week = useQuery(hoursOptions(dates.weekStart));
  return { userId, scope, projects, projectIds, dates, groups, summary, today, week };
}
export type WorkbenchResult = ReturnType<typeof useWorkbench>;
