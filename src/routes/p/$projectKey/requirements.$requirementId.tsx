import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { RequirementDetailLive } from "@/components/pm/requirement-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/requirements/$requirementId")({
  component: Page,
});

function Page() {
  const { projectKey, requirementId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 未登录：演示侧没有需求详情页，直接提示登录。
  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看需求详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  //（"9007199254740993" 会被 Number 舍入为 9007199254740992，渲染前必须阻断）
  const id = parseRequiredPositiveInt(requirementId);
  if (id === null) {
    return <EmptyHint>{`需求 ID 不合法（${requirementId}）。`}</EmptyHint>;
  }

  // Codex review 4175693765：参数导航（任务 A → 任务 B）时路由复用组件，
  // 草稿/replyTo/流转/改派/评论页码等 item-scoped 状态会残留而 mutation 已
  // 指向 B——key 强制按 requirementId 重新挂载，一次性全量重置，不逐个遗漏。
  return <RequirementDetailLive key={id} requirementId={id} projectKey={projectKey} />;
}
