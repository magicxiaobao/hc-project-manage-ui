import { canAccess } from "@/lib/access/snapshot";
import { useAccessSnapshot } from "@/lib/query/hooks/useAccessSnapshot";
import { AccessState } from "@/components/biz/access-state";
import {
  PermissionNavigation,
  projectNavigation,
  systemNavigation,
} from "@/components/biz/permission-navigation";
import { MenuBreadcrumbs, breadcrumbTrail } from "@/components/biz/menu-breadcrumbs";
import { NavigationFocus } from "@/components/pm/navigation-focus";
import { notifyPmChange } from "@/lib/pm/feedback";
import { useAuthStore } from "@/lib/api/auth-store";
import { useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { Toaster } from "sonner";
import {
  AppRail,
  CreateIssueDialog,
  Loading,
  NoticePanel,
  ProjectSidebar,
  RouteProgress,
  SearchDialog,
} from "@/components/biz";
import { ContentSkeleton } from "@/components/biz/skeleton";
import { useGoToItem } from "@/components/pm/use-go-item";
import { bindPmPersistence, usePm } from "@/lib/pm/store";
import { projectKeyFromPath } from "@/lib/pm/sidebar-nav";
import type { Person } from "@/lib/pm/domain";
import { PersistenceStatus } from "@/components/biz/persistence-status";

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const itemOrigin = location.state?.pmItemOrigin;
  const navOpen = usePm((state) => state.navOpen);
  const setNavOpen = usePm((state) => state.setNavOpen);
  const people = usePm((state) => state.people);
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  const notices = usePm((state) => state.notices);
  const currentUserId = usePm((state) => state.currentUserId);
  const noticeOpen = usePm((state) => state.noticeOpen);
  const ready = usePm((state) => state.ready);
  const persistenceError = usePm((state) => state.persistenceError);
  // 后端模式：页面展示真实后端数据，隐藏只读写本地 usePm 演示数据的 shell 入口，
  // 避免用户创建/打开本地事项后被带入无关的演示项目（与项目页隐藏“新建项目”同理）。
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUser = useAuthStore((state) => state.user);
  // 后端模式展示真实登录人；未登录时才用演示数据的选中人员。
  const me: Person | undefined =
    isAuthenticated && authUser
      ? { id: authUser.userId, name: authUser.cnName || authUser.userName || "已登录", role: authUser.roles.join("、") }
      : people.find((person) => person.id === currentUserId);
  const project = projects.find(
    (entry) => pathname === `/p/${entry.key}` || pathname.startsWith(`/p/${entry.key}/`),
  );
  // Codex review 4175510487：登录态的 /p/<key> 路径一律走真实后端分支——
  // 后端项目的 key 若恰好撞上演示 seed key（HC/PAY/OPS，见 src/lib/pm/seed.ts），
  // 演示项目同样会匹配到 project，此时必须让 live 分支胜出；否则真实后端项目
  // 会被渲染成完整的演示侧栏（含演示数据的仪表盘/缺陷/测试等入口）。
  const liveProjectKey = isAuthenticated ? projectKeyFromPath(pathname) : null;
  const unread = notices.filter((notice) => !notice.read).length;
  const [searchOpen, setSearchOpen] = useState(false);
  const goToItem = useGoToItem();
  // 桌面与移动侧栏使用相同授权树；项目参数只取当前真实 URL 上下文。
  const access = useAccessSnapshot();
  const accessNodes = access.status === "ready"
    ? liveProjectKey
      ? projectNavigation(access.visibleNavigation, liveProjectKey)
      : systemNavigation(access.visibleNavigation)
    : [];
  const accessNav = isAuthenticated ? (
    <div className="flex shrink-0 flex-col gap-1" role="group" aria-label="授权菜单">
      <h2 className="type-label px-3">授权菜单</h2>
      {access.status === "ready" ? (
        <PermissionNavigation nodes={accessNodes} pathname={pathname}
          params={liveProjectKey ? { projectKey: liveProjectKey } : undefined}
          onNavigate={() => setNavOpen(false)} />
      ) : <AccessState />}
    </div>
  ) : null;
  // 移动顶栏：当前菜单名称 + 面包屑（仅已认证且有授权链时）。
  const trail = isAuthenticated ? breadcrumbTrail(access, pathname) : [];
  const accessShielding = isAuthenticated && (access.status !== "ready" || !canAccess(access, pathname));

  useLayoutEffect(() => {
    // 后端模式不读写本地演示数据：跳过演示持久化绑定，避免本机演示数据
    // 损坏（hc-pm-sample-v1 解析失败）时把合法后端用户拦在错误页外——
    // 后端项目数据本就不依赖演示存储。
    // 依赖 isAuthenticated：登录 / 登出 / 根组件 hydrate 恢复时都重新配置持久化。
    // - false→true（登录、持久会话恢复）：cleanup 先解绑演示持久化，再直接置
    //   ready——修复“持久会话首屏在 hydrate 前已绑定损坏的演示存储、hydrate 后
    //   ready 仍为 false、已认证页永远停在骨架屏”的竞态（__root.tsx 的 hydrate
    //   是被动 effect，晚于本 layout effect）。
    // - true→false（登出）：重新绑定演示持久化，演示模式的编辑继续落盘。
    if (isAuthenticated) {
      usePm.setState({ ready: true });
      return;
    }
    return bindPmPersistence();
  }, [isAuthenticated]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Real modals block every shortcut here. A non-modal notice (aria-modal="false") does not.
      const blockingDialogSelector = '[role="dialog"]:not([aria-modal="false"])';
      if (document.querySelector(blockingDialogSelector)) return;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        usePm.getState().setCreateOpen(false);
        usePm.getState().setNavOpen(false);
        usePm.getState().setNoticeOpen(false);
        setSearchOpen(false);
      }
      if (
        !typing &&
        !useAuthStore.getState().isAuthenticated &&
        event.key.toLowerCase() === "c" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        usePm.getState().setCreateOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!ready || !persistenceError) return;
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [ready, persistenceError]);

  // 演示持久化错误只在演示模式拦截全页：后端模式下演示存储未绑定，
  // 也不应让本机演示数据问题遮挡真实后端页面。
  if (!ready && persistenceError && !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6 text-fg">
        <section role="alert" className="max-w-lg rounded-sm border border-danger bg-surface p-6">
          <h1 className="type-title">无法读取本机数据</h1>
          <p className="type-body mt-3">{persistenceError}</p>
          <button
            type="button"
            className="type-emphasis mt-4 rounded-sm bg-primary px-4 py-2 text-on-nav"
            onClick={() => usePm.getState().retryPersistence()}
          >
            重试读取
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
    <div className="flex h-screen overflow-hidden bg-bg text-fg" inert={accessShielding}>
      <RouteProgress />
      <NavigationFocus ready={ready} />
      <AppRail
        unread={unread}
        me={ready ? me : undefined}
        onSearch={isAuthenticated ? undefined : () => setSearchOpen(true)}
        onCreate={isAuthenticated ? undefined : () => usePm.getState().setCreateOpen(true)}
        onNotices={
          isAuthenticated
            ? undefined
            : () => {
                const next = !usePm.getState().noticeOpen;
                usePm.getState().setNoticeOpen(next);
                if (next) usePm.getState().markNoticesRead();
              }
        }
      />
      <ProjectSidebar
        open={navOpen}
        pathname={pathname}
        project={project}
        projects={projects}
        itemOrigin={itemOrigin}
        liveProjectKey={liveProjectKey}
        accessNav={accessNav}
        onClose={() => setNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col" inert={accessShielding}>
        {persistenceError ? (
          <section
            className="shrink-0 border-b border-danger bg-danger-soft px-4 py-3"
          >
            <PersistenceStatus ready={ready} error={persistenceError} onRetry={() => usePm.getState().retryPersistence()} />
          </section>
        ) : null}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 lg:hidden">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-sm hover:bg-line"
            aria-label="打开导航"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          <span className="min-w-0 flex-1 truncate">
            {ready ? (
              trail.length ? (
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="type-emphasis block truncate">{trail[trail.length - 1].label}</span>
                  <MenuBreadcrumbs snapshot={access} pathname={pathname} />
                </span>
              ) : (
                <span className="type-emphasis">{liveProjectKey ?? (project ? project.name : "恒川")}</span>
              )
            ) : (
              <Loading variant="inline" label="加载中" />
            )}
          </span>
        </div>
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div className="h-full overflow-auto">
            {isAuthenticated && <MenuBreadcrumbs snapshot={access} pathname={pathname} className="hidden px-4 py-2 lg:block" />}
            {ready ? children : <ContentSkeleton pathname={pathname} />}
          </div>
        </main>
      </div>
      {noticeOpen ? (
        <NoticePanel
          notices={notices}
          onClose={() => usePm.getState().setNoticeOpen(false)}
          onOpen={goToItem}
          onReset={
            isAuthenticated
              ? undefined
              : () => {
                  if (!window.confirm("恢复示例数据将替换当前数据，并写入本机持久化存储。确定恢复吗？")) return;
                  usePm.getState().reset();
                  notifyPmChange("已恢复示例数据");
                }
          }
        />
      ) : null}
      {searchOpen ? (
        <SearchDialog
          items={items}
          projects={projects}
          onClose={() => setSearchOpen(false)}
          onOpen={goToItem}
        />
      ) : null}
      <CreateIssueDialog />
      <Toaster position="top-center" />
    </div>
      {/* P5 p5-dynamic-route-permission §4.6：权限刷新/失败期间屏蔽受保护内容与
          交互，仅展示加载/重试层；children 保持挂载，不丢表单实例与草稿。 */}
      {accessShielding ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-bg"
          role="alertdialog"
          aria-label="权限状态"
          aria-busy="true"
        >
          <div className="rounded-md border border-border bg-surface shadow-lg">
            <AccessState />
          </div>
        </div>
      ) : null}
    </>
  );
}
