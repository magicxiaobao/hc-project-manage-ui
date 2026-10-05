/**
 * 测试用例详情路由（P2：p2-testcase-list-detail）：/p/$projectKey/testcases/$testCaseId。
 *
 * 未登录：直接提示登录（老前端 TestCaseDetail.vue 的 stub 只有演示静态文案，
 * 无演示详情概念）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { TestCaseDetailLive } from "@/components/pm/testcase-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/testcases/$testCaseId")({
  component: Page,
});

function Page() {
  const { projectKey, testCaseId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看测试用例详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(testCaseId);
  if (id === null) {
    return <EmptyHint>{`测试用例 ID 不合法（${testCaseId}）。`}</EmptyHint>;
  }

  // 参数导航（用例 A → 用例 B）时路由复用组件，key 强制按 testCaseId
  // 重新挂载，一次性重置所有 item-scoped 状态（同 defects/$defectId 模式）。
  return <TestCaseDetailLive key={id} testCaseId={id} projectKey={projectKey} />;
}
