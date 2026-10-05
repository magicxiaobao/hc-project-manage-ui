/**
 * 冲刺详情路由（P3：p3-sprint-detail）。
 *
 * /p/$projectKey/sprints/$sprintId：基本信息 + 燃尽图 Tab + 冲刺回顾 Tab，
 * 对标老前端 views/sprint/components/SprintDetail.vue。
 *
 * 登录态：r15 pi NOTE 指出的缺失登录 guard 在此补齐（boards.$boardId 同模式）——
 * 演示侧没有冲刺详情页，未登录直接提示登录。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { SprintDetailLive } from "@/components/pm/sprint-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { parseRequiredPositiveInt } from "@/lib/task-create";

export const Route = createFileRoute("/p/$projectKey/sprints/$sprintId")({
  component: Page,
});

function Page() {
  const { projectKey, sprintId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 未登录：演示侧没有冲刺详情页，直接提示登录。
  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看冲刺详情。"}</EmptyHint>;
  }

  // 十进制严格解析 + 回绕校验：拒绝超安全整数的静默舍入
  const id = parseRequiredPositiveInt(sprintId);
  if (id === null) {
    return <EmptyHint>{`冲刺 ID 不合法（${sprintId}）。`}</EmptyHint>;
  }

  // key 按 sprintId 重新挂载：参数导航（冲刺 A → 冲刺 B）时路由复用组件，
  // 回顾草稿/查询等 sprint-scoped 状态会残留——强制重挂载一次性全量重置。
  return <SprintDetailLive key={id} sprintId={id} projectKey={projectKey} />;
}
