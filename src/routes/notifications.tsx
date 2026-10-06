import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/pm/shell";
import { NotificationListPage } from "@/components/pm/notification-list-page";
export const Route = createFileRoute("/notifications")({ component: NotificationsPage });
function NotificationsPage() {
  return (
    <AppShell>
      <NotificationListPage />
    </AppShell>
  );
}
