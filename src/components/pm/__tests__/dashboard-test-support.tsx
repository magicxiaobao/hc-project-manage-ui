import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { createBrowserHistory, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { DashboardForm } from '../dashboard-form-dialog';
import { DashboardWidgetForm } from '../dashboard-widget-form-dialog';
import type { LeaveHandle } from '../dashboard-form-fields';
import type { DashboardResponse, DashboardWidgetResponse } from '@/lib/api/dashboard-types';

// 仅替换 modal 的动画/portal 与 HeroUI Button；表单、守卫、路由和 Query 均真实。
vi.mock('@heroui/react', () => ({ Button: ({ children, onPress, isDisabled, type, ...rest }: { children: ReactNode; onPress?: () => void; isDisabled?: boolean; type?: 'button' | 'submit'; variant?: string; size?: string }) => <button type={type ?? 'button'} disabled={isDisabled} onClick={onPress}>{children}</button> }));
vi.mock('@/components/biz/app-modal', () => ({ AppModal: ({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) => {
  useEffect(() => { if (!open) return; const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler); }, [open, onClose]);
  return open ? <div role="dialog" aria-label={title}><h2>{title}</h2><button onClick={onClose}>关闭{title}</button><button onClick={onClose}>遮罩{title}</button>{children}</div> : null;
} }));

export function dashboardDetail(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return { id: 7, createdAt: null, updatedAt: null, dashboardName: '原名称', description: null, dashboardType: '未知类型', projectId: 3, ownerId: null, dashboardConfig: null, isDefault: true, isPublic: null, sortOrder: null, status: '活跃', refreshInterval: null, autoRefresh: null, theme: '未知主题', accessConfig: null, lastAccessedAt: null, accessCount: null, ...overrides };
}
export function widgetDetail(overrides: Partial<DashboardWidgetResponse> = {}): DashboardWidgetResponse {
  return { id: 11, createdAt: null, updatedAt: null, dashboardId: 7, widgetName: '原小部件', widgetTitle: null, widgetType: '未知类型', dataSource: null, widgetConfig: '{}', positionX: null, positionY: null, width: 6, height: 4, sortOrder: null, isVisible: null, isResizable: false, isDraggable: false, refreshInterval: null, autoRefresh: null, styleConfig: '原样', filterConfig: null, lastUpdatedAt: null, ...overrides };
}
export async function renderDashboardContent(content: ReactNode) {
  window.scrollTo = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const root = createRootRoute({ component: Outlet });
  const form = createRoute({ getParentRoute: () => root, path: '/test', component: () => content });
  const away = createRoute({ getParentRoute: () => root, path: '/away', component: () => <p>已离开</p> });
  const router = createRouter({ routeTree: root.addChildren([form, away]), history: createMemoryHistory({ initialEntries: ['/test'] }) });
  await router.load();
  return { ...render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>), client, router };
}
export async function renderDashboardForm(kind: 'dashboard' | 'widget', id?: number, browser = false) {
  window.scrollTo = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Harness = forwardRef(function Harness() {
    const [open, setOpen] = useState(true); const ref = useRef<LeaveHandle>(null);
    const props = { ref, open, id, onClose: () => setOpen(false), onSaved: () => {} };
    return <><button onClick={() => setOpen(true)}>重新打开</button><button onClick={() => ref.current?.requestLeave(() => setOpen(false))}>父层关闭</button>{kind === 'dashboard' ? <DashboardForm {...props} projectId={3} /> : <DashboardWidgetForm {...props} dashboardId={7} />}</>;
  });
  const root = createRootRoute({ component: Outlet });
  const form = createRoute({ getParentRoute: () => root, path: '/form', component: Harness });
  const away = createRoute({ getParentRoute: () => root, path: '/away', component: () => <p>已离开</p> });
  if (browser) window.history.replaceState(null, '', '/away');
  const history = browser ? createBrowserHistory() : createMemoryHistory({ initialEntries: ['/away', '/form'], initialIndex: 1 });
  if (browser) { history.push('/form'); history.flush?.(); }
  const router = createRouter({ routeTree: root.addChildren([form, away]), history });
  await router.load();
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { ...view, router, client };
}
