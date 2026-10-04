/**
 * defects 看板子路由（P2：p2-defect-board）。
 *
 * 登录态：projectKey → projectId（useProjectIdByKey）→ DefectBoardLive
 * （GET /defect/v1/board + /defect/v1/statistics）。
 * 未登录：登录提示（未登录演示看板在 defects/index 的 BoardView；
 * 本路由为登录态真实数据视图）。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { DefectBoardLive, DefectViewTabs } from "@/components/pm/defect-board-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/defects/board")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 p-4 md:p-6">
        <p className="type-body text-default-500">登录后可查看该项目的缺陷看板（真实后端数据）。</p>
        <Link
          to="/p/$projectKey/defects"
          params={{ projectKey }}
          className="type-body underline-offset-2 hover:underline"
        >
          ← 返回缺陷列表（含未登录演示看板）
        </Link>
      </div>
    );
  }
  return <LiveDefectBoard projectKey={projectKey} />;
}

function LiveDefectBoard({ projectKey }: { projectKey: string }) {
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
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6 md:pt-6">
        <DefectViewTabs projectKey={projectKey} active="board" />
      </div>
      <DefectBoardLive projectId={resolution.data} projectKey={projectKey} />
    </div>
  );
}
