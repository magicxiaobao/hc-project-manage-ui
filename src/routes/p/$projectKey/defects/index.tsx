/**
 * defects 列表子路由（P2：p2-defect-list-create 替换 BoardView 演示数据；
 * p2-defect-detail-flow 拆出布局路由，原页面内容下沉为本 index 子路由）。
 *
 * 登录态：projectKey → projectId（useProjectIdByKey）→ DefectListLive
 * （POST /defect/v1/findByPage + DefectCreateDialog）。
 * 未登录：保留原演示看板（BoardView），供未登录浏览。
 */
import { createFileRoute } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { BoardView } from "@/components/pm/board-view";
import { DefectListLive } from "@/components/pm/defect-list-live";
import { DefectViewTabs } from "@/components/pm/defect-board-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/defects/")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const { keyword } = Route.useSearch();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <BoardView projectKey={projectKey} lockedKind="defect" />;
  return <LiveDefectList projectKey={projectKey} keyword={keyword} />;
}

/**
 * P2 p2-defect-list-create：路由 key（字符串）→ 后端 id（数字）→
 * POST /defect/v1/findByPage。演示数据不再用于已登录的缺陷列表。
 */
function LiveDefectList({ projectKey, keyword }: { projectKey: string; keyword?: string }) {
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

  return (
    <div>
      <div className="mx-auto max-w-5xl px-4 pt-4 md:px-6 md:pt-6">
        <DefectViewTabs projectKey={projectKey} active="list" />
      </div>
      <DefectListLive projectId={resolution.data} projectKey={projectKey} keyword={keyword} />
    </div>
  );
}
