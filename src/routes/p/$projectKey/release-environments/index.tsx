/**
 * release-environments 列表子路由（P2：p2-release-env）。
 *
 * 登录态：projectKey → projectId（useProjectIdByKey）→ ReleaseEnvironmentListLive
 * （GET /release-environment/v1/project/{projectId} + 发布环境新建/编辑/停用弹窗）。
 * 未登录：演示侧无发布环境独立管理页（ReleasesView 的发布环境区是演示 store
 * 数据），这里直接提示登录（沿用 versions/$versionId 模式）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { ReleaseEnvironmentListLive } from "@/components/pm/release-environment-list-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/release-environments/")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看发布环境。"}</EmptyHint>;
  }
  return <LiveReleaseEnvironmentList projectKey={projectKey} />;
}

/**
 * P2 p2-release-env：路由 key（字符串）→ 后端 id（数字）→
 * GET /release-environment/v1/project/{projectId}。
 */
function LiveReleaseEnvironmentList({ projectKey }: { projectKey: string }) {
  const resolution = useProjectIdByKey(projectKey);
  // 上次解析成功的项目 id：后台重取失败（isError）或结果变空时，保留已挂载的
  // 列表与其弹窗子树，脏表单不被卸载（沿用 tests/index 的 codex 本地评审 finding 2 教训）
  const lastGoodProjectId = useRef<number | null>(null);
  if (typeof resolution.data === "number") {
    lastGoodProjectId.current = resolution.data;
  }
  const projectId =
    typeof resolution.data === "number"
      ? resolution.data
      : lastGoodProjectId.current;

  if (resolution.isPending && projectId == null) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" /> 正在解析项目…
      </div>
    );
  }
  if (projectId == null) {
    if (resolution.isError) {
      return (
        <div className="flex flex-col items-start gap-3 px-4 py-8">
          <p className="type-body text-danger">
            项目解析失败：{toUserMessage(resolution.error)}
          </p>
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

  return <ReleaseEnvironmentListLive projectId={projectId} projectKey={projectKey} />;
}
