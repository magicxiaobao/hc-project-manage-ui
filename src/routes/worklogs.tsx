import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/pm/shell";
import { WorkLogListPage } from "@/components/pm/worklog-list-page";
import { useAuthStore } from "@/lib/api/auth-store";
export const Route = createFileRoute("/worklogs")({ component: WorklogsPage });
function WorklogsPage() {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    useAuthStore.getState().hydrate();
    setReady(true);
  }, []);
  return (
    <AppShell>
      {!ready ? (
        <p className="p-6">正在恢复登录状态…</p>
      ) : authenticated ? (
        <WorkLogListPage />
      ) : (
        <div className="p-6">
          <p>请登录后查看工时管理。</p>
          <Link to="/login" className="text-accent underline">
            登录
          </Link>
        </div>
      )}
    </AppShell>
  );
}
