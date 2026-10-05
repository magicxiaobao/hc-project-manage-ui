/**
 * 缺陷详情路由（P2：p2-defect-detail-flow）：/p/$projectKey/defects/$defectId。
 *
 * 未登录：演示侧无缺陷详情概念（BoardView 只做演示看板），这里直接提示登录。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { DefectDetailLive } from "@/components/pm/defect-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/defects/$defectId")({
  component: Page,
});

function Page() {
  const { projectKey, defectId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看缺陷详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(defectId);
  if (id === null) {
    return <EmptyHint>{`缺陷 ID 不合法（${defectId}）。`}</EmptyHint>;
  }

  // 参数导航（缺陷 A → 缺陷 B）时路由复用组件，key 强制按 defectId
  // 重新挂载，一次性重置所有 item-scoped 状态（同 issues/$taskId 模式）。
  return <DefectDetailLive key={id} defectId={id} projectKey={projectKey} />;
}
