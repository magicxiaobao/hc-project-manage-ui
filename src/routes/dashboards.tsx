import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/pm/shell';
import { DashboardListPage } from '@/components/pm/dashboard-list-page';
import { useAuthStore } from '@/lib/api/auth-store';

export const Route = createFileRoute('/dashboards')({ component: DashboardsPage });
function DashboardsPage() {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const [ready, setReady] = useState(false);
  useEffect(() => { useAuthStore.getState().hydrate(); setReady(true); }, []);
  return <AppShell>{!ready ? <p className="p-6">正在恢复登录状态…</p> : authenticated ? <DashboardListPage /> : <div className="p-6"><p>请登录后查看仪表盘。</p><Link to="/login" className="text-accent underline">登录</Link></div>}</AppShell>;
}
