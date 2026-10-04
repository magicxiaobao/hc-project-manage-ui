/**
 * 任务新建路由（P1：p1-task-create）。
 *
 * issues 布局路由的子路由：projectKey → id 解析后渲染
 * TaskCreateLive（真实后端创建），提交成功后跳回任务列表。
 * 未登录时渲染登录提示（Codex review 4175631821：布局路由不再拦截，由本页守卫）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { TaskCreateLive } from "@/components/pm/task-create-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/issues/new")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // Codex review 4175631821：布局路由不再做登录拦截，深链接可达时此处自行守卫。
  if (!isAuthenticated) {
    return <EmptyHint>{"登录后新建任务。"}</EmptyHint>;
  }
  return <LiveTaskCreate projectKey={projectKey} />;
}

/** P1 p1-task-create：路由 key（字符串）→ 后端 id（数字）→ TaskCreateLive。 */
function LiveTaskCreate({ projectKey }: { projectKey: string }) {
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

  return <TaskCreateLive projectId={resolution.data} projectKey={projectKey} />;
}
