import { createFileRoute } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { TraceView } from "@/components/pm/trace-view";
import { TraceViewLive } from "@/components/pm/trace-view-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/trace")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 登录态：需求追溯走真实后端（projectKey → id 解析 + trace/impact/matrix/hierarchy）。
  // 未登录：保留演示追溯视图（usePm 种子数据）。
  if (!isAuthenticated) return <TraceView projectKey={projectKey} />;
  return <LiveTraceView projectKey={projectKey} />;
}

/**
 * P1 p1-requirement-trace：路由 key（字符串）→ 后端 id（数字）→ 追溯真实数据。
 * 演示数据不再用于已登录的追溯视图。
 */
function LiveTraceView({ projectKey }: { projectKey: string }) {
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

  return <TraceViewLive projectId={resolution.data} projectKey={projectKey} />;
}
