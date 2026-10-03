import { createFileRoute } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { TaskListLive } from "@/components/pm/task-list-live";
import { ListView } from "@/components/pm/list-view";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/issues")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 登录态：任务列表走真实后端（projectKey → id 解析 + findByPage 列表）。
  // 未登录：保留演示列表（ListView）。
  if (!isAuthenticated) return <ListView projectKey={projectKey} />;
  return <LiveTaskList projectKey={projectKey} />;
}

/**
 * P1 p1-task-list：路由 key（字符串）→ 后端 id（数字）→ POST /task/v1/findByPage。
 * 演示数据不再用于已登录的任务列表。
 */
function LiveTaskList({ projectKey }: { projectKey: string }) {
  const resolution = useProjectIdByKey(projectKey);

  if (resolution.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在解析项目…
      </div>
    );
  }
  if (resolution.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">项目解析失败：{toUserMessage(resolution.error)}</p>
        <Button variant="ghost" onPress={() => void resolution.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (resolution.data == null) {
    return (
      <EmptyHint>{`没有找到这个项目（${projectKey}）。请检查项目标识是否正确，或确认你有该项目的访问权限。`}</EmptyHint>
    );
  }

  return <TaskListLive projectId={resolution.data} />;
}
