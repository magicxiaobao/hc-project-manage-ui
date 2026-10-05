import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/pm/shell";
import { WorkLogAnalyticsPage } from "@/components/pm/worklog-analytics-page";
import { useAuthStore } from "@/lib/api/auth-store";
export const Route = createFileRoute("/worklogs_/analytics")({ component: WorklogsAnalyticsRoute });
export function WorklogsAnalyticsRoute() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    useAuthStore.getState().hydrate();
    setReady(true);
  }, []);
  return (
    <AppShell>
      {ready ? <WorkLogAnalyticsPage /> : <p className="p-6">正在恢复登录状态…</p>}
    </AppShell>
  );
}
