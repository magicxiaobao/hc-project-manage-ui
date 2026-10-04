/**
 * testcases 列表子路由（P2：p2-testcase-list-detail）。
 *
 * 登录态：projectKey → projectId（useProjectIdByKey）→ TestCaseListLive
 * （POST /testCase/v1/findByPage + TestCaseFormDialog）。
 * 未登录：保留原演示测试视图（TestsView），供未登录浏览。
 */
import { createFileRoute } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { TestCaseListLive } from "@/components/pm/testcase-list-live";
import { TestsView } from "@/components/pm/tests-view";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/testcases/")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <TestsView projectKey={projectKey} />;
  return <LiveTestCaseList projectKey={projectKey} />;
}

/**
 * P2 p2-testcase-list-detail：路由 key（字符串）→ 后端 id（数字）→
 * POST /testCase/v1/findByPage。演示数据不再用于已登录的用例列表。
 */
function LiveTestCaseList({ projectKey }: { projectKey: string }) {
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

  return <TestCaseListLive projectId={resolution.data} projectKey={projectKey} />;
}
