import { useAuthStore } from "@/lib/api/auth-store";
import { workbenchUserId } from "@/lib/workbench-data";
import { useWorkbench } from "@/lib/query/hooks/useWorkbench";
import { useNotificationUnreadCount } from "@/lib/query/hooks/useNotifications";
import { WorkbenchTasksCard } from "./workbench/workbench-tasks-card";
import { WorkbenchHoursCard } from "./workbench/workbench-hours-card";
import { WorkbenchNotificationsCard } from "./workbench/workbench-notifications-card";
import { WorkbenchQuickLinks } from "./workbench/workbench-quick-links";
export function WorkbenchPage() {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const rawId = useAuthStore((s) => s.user?.userId);
  const userId = authenticated ? workbenchUserId(rawId) : null;
  return userId === null ? (
    <p role="alert" className="p-6">
      登录身份无效，请重新登录。
    </p>
  ) : (
    <WorkbenchContent key={userId} />
  );
}
function WorkbenchContent() {
  const workbench = useWorkbench();
  const notifications = useNotificationUnreadCount(false);
  return (
    <main className="grid gap-4 p-4 md:p-6">
      <header>
        <h1 className="type-title">个人工作台</h1>
        <p className="type-caption mt-2">
          范围：全部可见项目；不包含不可见项目。统计权限由服务端判定。
        </p>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <WorkbenchTasksCard workbench={workbench} />
        <WorkbenchHoursCard workbench={workbench} />
        <WorkbenchNotificationsCard query={notifications} />
      </div>
      <WorkbenchQuickLinks projects={workbench.projects} />
    </main>
  );
}
