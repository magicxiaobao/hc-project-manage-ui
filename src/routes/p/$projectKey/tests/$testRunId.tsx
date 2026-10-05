/**
 * 测试轮详情/执行工作台路由（P2：p2-testrun-workspace）：/p/$projectKey/tests/$testRunId。
 *
 * 未登录：直接提示登录（老前端测试轮工作台无演示详情概念）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { TestRunDetailLive } from "@/components/pm/testrun-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/tests/$testRunId")({
  component: Page,
});

function Page() {
  const { projectKey, testRunId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看测试轮详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(testRunId);
  if (id === null) {
    return <EmptyHint>{`测试轮 ID 不合法（${testRunId}）。`}</EmptyHint>;
  }

  // 参数导航（测试轮 A → 测试轮 B）时路由复用组件，key 强制按 testRunId
  // 重新挂载，一次性重置所有 item-scoped 状态（同 testsuites/$testSuiteId 模式）。
  return <TestRunDetailLive key={id} testRunId={id} projectKey={projectKey} />;
}
