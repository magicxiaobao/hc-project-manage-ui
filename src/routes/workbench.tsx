import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/pm/shell";
import { WorkbenchPage } from "@/components/pm/workbench-page";
import { useAuthStore } from "@/lib/api/auth-store";
export const Route = createFileRoute("/workbench")({ component: WorkbenchRoutePage });
function WorkbenchRoutePage() {
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
        <WorkbenchPage />
      ) : (
        <div className="p-6">
          <p>请登录后查看个人工作台。</p>
          <Link to="/login" className="text-accent underline">
            登录
          </Link>
        </div>
      )}
    </AppShell>
  );
}
