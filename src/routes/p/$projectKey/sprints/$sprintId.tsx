/**
 * 冲刺详情路由占位（P3：p3-sprint-detail 将接线）。
 *
 * p3-sprint-list 先注册该路由，使列表的"详情" Link 类型安全；
 * p3-sprint-detail（/p/$projectKey/sprints/$sprintId：基本信息 + 燃尽图 Tab
 * + 冲刺回顾 Tab）会替换本占位为完整实现。
 */
import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";

export const Route = createFileRoute("/p/$projectKey/sprints/$sprintId")({
  component: Page,
});

function Page() {
  const { sprintId } = Route.useParams();
  return (
    <div className="p-4 md:p-6">
      <EmptyHint>
        {`冲刺 #${sprintId} 的详情（燃尽图 + 冲刺回顾）正在迁移中，p3-sprint-detail 接线后上线。`}
      </EmptyHint>
    </div>
  );
}
