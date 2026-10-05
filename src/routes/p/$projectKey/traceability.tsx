import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { TraceMatrixLive } from "@/components/pm/trace-matrix-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { isPositiveSafeId } from "@/lib/task-dependencies-live";
import { useProjectIdByKey, toUserMessage } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/traceability")({ component: Page });
function Page() {
  const { projectKey } = Route.useParams();
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  if (!authenticated)
    return (
      <div className="px-4 py-8">
        <EmptyHint>请登录后查看需求追溯矩阵。</EmptyHint>
        <Link to="/login" className="type-link">
          登录
        </Link>
      </div>
    );
  return <ResolvedMatrix projectKey={projectKey} />;
}
function ResolvedMatrix({ projectKey }: { projectKey: string }) {
  const resolution = useProjectIdByKey(projectKey);
  if (resolution.isPending)
    return (
      <div role="status" className="flex items-center gap-2 px-4 py-8">
        <Spinner size="sm" />
        正在解析项目…
      </div>
    );
  if (resolution.isError)
    return (
      <div role="alert" className="px-4 py-8">
        <p>项目解析失败：{toUserMessage(resolution.error)}</p>
        <Button variant="ghost" onPress={() => void resolution.refetch()}>
          重试
        </Button>
      </div>
    );
  if (!isPositiveSafeId(resolution.data))
    return <EmptyHint>{`没有找到这个项目（${projectKey}）。请检查项目标识或访问权限。`}</EmptyHint>;
  return <TraceMatrixLive key={`${projectKey}:${resolution.data}`} projectId={resolution.data} />;
}
