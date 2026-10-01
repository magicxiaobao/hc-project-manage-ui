import { useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { AppRail, CreateIssueDialog, Loading, NoticePanel, ProjectSidebar, RouteProgress, SearchDialog } from "@/components/biz";
import { ContentSkeleton } from "@/components/biz/skeleton";
import { useGoToItem } from "@/components/pm/use-go-item";
import { bindPmPersistence, usePm } from "@/lib/pm/store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navOpen = usePm((state) => state.navOpen);
  const setNavOpen = usePm((state) => state.setNavOpen);
  const people = usePm((state) => state.people);
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  const notices = usePm((state) => state.notices);
  const currentUserId = usePm((state) => state.currentUserId);
  const noticeOpen = usePm((state) => state.noticeOpen);
  const ready = usePm((state) => state.ready);
  const me = people.find((person) => person.id === currentUserId);
  const project = projects.find((entry) => pathname === `/p/${entry.key}` || pathname.startsWith(`/p/${entry.key}/`));
  const unread = notices.filter((notice) => !notice.read).length;
  const [searchOpen, setSearchOpen] = useState(false);
  const goToItem = useGoToItem();

  useLayoutEffect(() => {
    bindPmPersistence();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        usePm.getState().setCreateOpen(false);
        usePm.getState().setNavOpen(false);
        usePm.getState().setNoticeOpen(false);
        setSearchOpen(false);
      }
      if (!typing && event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        usePm.getState().setCreateOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      <RouteProgress />
      <AppRail
        unread={unread}
        me={ready ? me : undefined}
        onSearch={() => setSearchOpen(true)}
        onCreate={() => usePm.getState().setCreateOpen(true)}
        onNotices={() => {
          const next = !usePm.getState().noticeOpen;
          usePm.getState().setNoticeOpen(next);
          if (next) usePm.getState().markNoticesRead();
        }}
      />
      <ProjectSidebar open={navOpen} pathname={pathname} project={project} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:hidden">
          <button type="button" className="rounded-sm p-2 hover:bg-line" aria-label="打开导航" onClick={() => setNavOpen(true)}>
            <Menu className="size-4" />
          </button>
          <span className="min-w-0 truncate">{ready ? <span className="type-emphasis">{project ? project.name : "恒川"}</span> : <Loading variant="inline" label="加载中" />}</span>
        </div>
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div className="h-full overflow-auto">{ready ? children : <ContentSkeleton pathname={pathname} />}</div>
        </main>
      </div>
      {noticeOpen ? (
        <NoticePanel
          notices={notices}
          onClose={() => usePm.getState().setNoticeOpen(false)}
          onOpen={goToItem}
          onReset={() => {
            usePm.getState().reset();
            toast("已恢复示例数据");
          }}
        />
      ) : null}
      {searchOpen ? <SearchDialog items={items} projects={projects} onClose={() => setSearchOpen(false)} onOpen={goToItem} /> : null}
      <CreateIssueDialog />
      <Toaster position="top-center" />
    </div>
  );
}
