/**
 * 版本详情路由（P2：p2-version-slices）：/p/$projectKey/versions/$versionId。
 *
 * 未登录：演示侧无版本详情概念（ReleasesView 只做演示版本管理），这里直接提示登录
 * （沿用 defects/$defectId 模式）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { VersionDetailLive } from "@/components/pm/version-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/versions/$versionId")({
  component: Page,
});

function Page() {
  const { projectKey, versionId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看版本详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(versionId);
  if (id === null) {
    return <EmptyHint>{`版本 ID 不合法（${versionId}）。`}</EmptyHint>;
  }

  // 参数导航（版本 A → 版本 B）时路由复用组件，key 强制按 versionId
  // 重新挂载，一次性重置所有 item-scoped 状态（同 issues/$taskId 模式）。
  return <VersionDetailLive key={id} versionId={id} projectKey={projectKey} />;
}
