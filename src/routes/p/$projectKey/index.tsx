import { createFileRoute } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { BoardView } from "@/components/pm/board-view";
import { ProjectDetailView } from "@/components/pm/project-detail-view";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectDetail, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/")({
  component: ProjectHome,
});

function ProjectHome() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 登录态：项目走真实后端（projectKey → id 解析 + findById 详情）。
  // 未登录：保留演示看板（usePm 种子数据）。
  if (!isAuthenticated) return <BoardView projectKey={projectKey} />;
  return <LiveProjectDetail projectKey={projectKey} />;
}

/**
 * P1 p1-project-detail-live：路由 key（字符串）→ 后端 id（数字）→ GET /project/v1/findById/{id}。
 * 演示数据不再用于已登录的项目首页。
 */
function LiveProjectDetail({ projectKey }: { projectKey: string }) {
  const resolution = useProjectIdByKey(projectKey);
  const detail = useProjectDetail(resolution.data ?? null);

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

  if (detail.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载项目详情…
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">项目详情加载失败：{toUserMessage(detail.error)}</p>
        <Button variant="ghost" onPress={() => void detail.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (!detail.data) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return <ProjectDetailView project={detail.data} />;
}
