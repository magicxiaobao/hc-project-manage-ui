/**
 * releases 列表子路由（P2：p2-release-lifecycle）。
 *
 * 登录态：projectKey → projectId（useProjectIdByKey）→ ReleaseListLive
 * （POST /release/v1/findByPage + ReleaseDraftCreateDialog）。
 * 未登录：保留原演示发布管理（ReleasesView），供未登录浏览。
 */
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { Button, Spinner } from "@heroui/react";
import { ReleasesView } from "@/components/pm/releases-view";
import { ReleaseListLive } from "@/components/pm/release-list-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/releases/")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <ReleasesView projectKey={projectKey} />;
  return <LiveReleaseList projectKey={projectKey} />;
}

/**
 * P2 p2-release-lifecycle：路由 key（字符串）→ 后端 id（数字）→
 * POST /release/v1/findByPage。演示数据不再用于已登录的发布列表。
 */
function LiveReleaseList({ projectKey }: { projectKey: string }) {
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

  return <ReleaseListLive projectId={projectId} projectKey={projectKey} />;
}
