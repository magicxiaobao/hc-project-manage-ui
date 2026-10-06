/**
 * testcases 列表子路由（P2：p2-testcase-list-detail）。
 *
 * 登录态：projectKey → projectId（useProjectIdByKey）→ TestCaseListLive
 * （POST /testCase/v1/findByPage + TestCaseFormDialog）。
 * 未登录：保留原演示测试视图（TestsView），供未登录浏览。
 */
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
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
  const { keyword } = Route.useSearch();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <TestsView projectKey={projectKey} />;
  return <LiveTestCaseList projectKey={projectKey} keyword={keyword} />;
}

/**
 * P2 p2-testcase-list-detail：路由 key（字符串）→ 后端 id（数字）→
 * POST /testCase/v1/findByPage。演示数据不再用于已登录的用例列表。
 */
function LiveTestCaseList({ projectKey, keyword }: { projectKey: string; keyword?: string }) {
  const resolution = useProjectIdByKey(projectKey);
  // 上次解析成功的项目 id：后台重取失败（isError）或结果变空时，保留已挂载的
  // 列表与其弹窗子树，脏表单不被卸载（codex 本地评审 finding 2）。
  const lastGoodProjectId = useRef<number | null>(null);
  if (typeof resolution.data === "number") {
    lastGoodProjectId.current = resolution.data;
  }
  const projectId = typeof resolution.data === "number" ? resolution.data : lastGoodProjectId.current;

  if (resolution.isPending && projectId == null) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在解析项目…
      </div>
    );
  }
  if (projectId == null) {
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
    return (
      <EmptyHint>{`没有找到这个项目（${projectKey}）。请检查项目标识是否正确，或确认你有该项目的访问权限。`}</EmptyHint>
    );
  }

  // 后台重取失败时保留列表挂载：顶部展示错误横幅 + 重试，不卸载脏表单。
  return (
    <>
      {resolution.isError ? (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2">
          <p className="type-body flex-1 text-danger">
            项目解析失败（后台刷新）：{toUserMessage(resolution.error)}。列表为上次成功的数据。
          </p>
          <Button size="sm" variant="ghost" onPress={() => void resolution.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      <TestCaseListLive projectId={projectId} projectKey={projectKey} keyword={keyword} />
    </>
  );
}
