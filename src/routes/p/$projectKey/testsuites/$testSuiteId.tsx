/**
 * 测试套件详情路由（P2：p2-testsuite-live）：/p/$projectKey/testsuites/$testSuiteId。
 *
 * 未登录：直接提示登录（老前端 TestSuiteDetail 无演示详情概念）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { TestSuiteDetailLive } from "@/components/pm/testsuite-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/testsuites/$testSuiteId")({
  component: Page,
});

function Page() {
  const { projectKey, testSuiteId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看测试套件详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(testSuiteId);
  if (id === null) {
    return <EmptyHint>{`测试套件 ID 不合法（${testSuiteId}）。`}</EmptyHint>;
  }

  // 参数导航（套件 A → 套件 B）时路由复用组件，key 强制按 testSuiteId
  // 重新挂载，一次性重置所有 item-scoped 状态（同 defects/$defectId 模式）。
  return <TestSuiteDetailLive key={id} testSuiteId={id} projectKey={projectKey} />;
}
