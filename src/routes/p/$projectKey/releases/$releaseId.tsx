/**
 * 发布详情路由（P2：p2-release-lifecycle）：/p/$projectKey/releases/$releaseId。
 *
 * 未登录：演示侧无发布详情概念，这里直接提示登录（沿用 versions/$versionId
 * 模式）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { ReleaseDetailLive } from "@/components/pm/release-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/releases/$releaseId")({
  component: Page,
});

function Page() {
  const { projectKey, releaseId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看发布详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(releaseId);
  if (id === null) {
    return <EmptyHint>{`发布 ID 不合法（${releaseId}）。`}</EmptyHint>;
  }

  // 参数导航（发布 A → 发布 B）时路由复用组件，key 强制按 releaseId
  // 重新挂载，一次性重置所有 item-scoped 状态（同 issues/$taskId 模式）。
  return <ReleaseDetailLive key={id} releaseId={id} projectKey={projectKey} />;
}
