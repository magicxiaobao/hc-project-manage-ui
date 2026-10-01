import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Kanban, Layers, Menu, Package, Plus, RotateCcw, Search, SquareCheckBig, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { Avatar, TypeIcon } from "@/components/pm/bits";
import { CreateDialog } from "@/components/pm/create-dialog";
import { useGoToItem } from "@/components/pm/use-go-item";
import { formatRelative, kindLabel } from "@/lib/pm/domain";
import { bindPmPersistence, usePm } from "@/lib/pm/store";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navOpen = usePm((state) => state.navOpen);
  const setNavOpen = usePm((state) => state.setNavOpen);
  const people = usePm((state) => state.people);
  const projects = usePm((state) => state.projects);
  const notices = usePm((state) => state.notices);
  const currentUserId = usePm((state) => state.currentUserId);
  const searchOpen = usePm((state) => state.noticeOpen);
  const me = people.find((person) => person.id === currentUserId);
  const project = projects.find((entry) => pathname === `/p/${entry.key}` || pathname.startsWith(`/p/${entry.key}/`));
  const unread = notices.filter((notice) => !notice.read).length;
  const [searchOpenLocal, setSearchOpenLocal] = useState(false);

  useEffect(() => {
    bindPmPersistence();
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "Escape") {
        usePm.getState().setCreateOpen(false);
        usePm.getState().setNavOpen(false);
        usePm.getState().setNoticeOpen(false);
        setSearchOpenLocal(false);
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
      <nav className="z-30 flex w-16 shrink-0 flex-col items-center bg-nav py-3 text-white" aria-label="应用">
        <Link to="/" className="mb-5 flex size-9 items-center justify-center rounded-[3px] bg-white/15 text-sm font-semibold" title="恒川">
          恒
        </Link>
        <RailButton label="搜索事项" onClick={() => setSearchOpenLocal(true)}>
          <Search className="size-5" />
        </RailButton>
        <RailButton label="创建事项" onClick={() => usePm.getState().setCreateOpen(true)}>
          <Plus className="size-6" />
        </RailButton>
        <div className="mt-auto flex flex-col items-center gap-2">
          <RailButton
            label="通知"
            onClick={() => {
              const next = !searchOpen;
              usePm.getState().setNoticeOpen(next);
              if (next) usePm.getState().markNoticesRead();
            }}
          >
            <span className="relative">
              <Bell className="size-5" />
              {unread > 0 ? <span className="absolute -top-1 -right-1 size-2 rounded-full bg-danger" /> : null}
            </span>
          </RailButton>
          <button
            type="button"
            title="恢复示例数据"
            className="rounded-full p-0.5 hover:bg-white/10"
            onClick={() => {
              usePm.getState().reset();
              toast("已恢复示例数据");
            }}
          >
            <Avatar person={me} className="size-8 bg-white/20 text-white" />
          </button>
        </div>
      </nav>

      {navOpen ? (
        <button type="button" aria-label="关闭导航" className="fixed inset-0 z-20 bg-[#091e42]/40 md:hidden" onClick={() => setNavOpen(false)} />
      ) : null}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-16 z-30 w-[230px] flex-col border-r border-border bg-surface px-4 pt-6 pb-4 md:static md:z-0 md:flex",
          navOpen ? "flex" : "hidden",
        )}
      >
        <button type="button" className="mb-3 self-end rounded-[3px] p-1 text-muted hover:bg-line md:hidden" aria-label="关闭侧栏" onClick={() => setNavOpen(false)}>
          <X className="size-4" />
        </button>
        {project ? (
          <>
            <div className="flex items-center gap-3 px-1">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[3px] bg-primary text-sm font-semibold text-white">{project.key.slice(0, 2)}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{project.name}</div>
                <div className="truncate text-xs text-faint">软件项目</div>
              </div>
            </div>
            <div className="my-4 h-px bg-border" />
            <nav className="flex flex-col gap-1">
              <ProjectLink projectKey={project.key} to="/p/$projectKey" active={pathname === `/p/${project.key}`} icon={<Kanban className="size-4" />} label="看板" />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/backlog" active={pathname.endsWith("/backlog")} icon={<Layers className="size-4" />} label="待办" />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/issues" active={pathname.includes("/issues") || pathname.includes("/items/")} icon={<SquareCheckBig className="size-4" />} label="事项" />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/releases" active={pathname.endsWith("/releases")} icon={<Package className="size-4" />} label="版本" />
            </nav>
          </>
        ) : (
          <>
            <div className="px-1 text-sm font-semibold">恒川</div>
            <div className="px-1 text-xs text-faint">项目协作</div>
            <div className="my-4 h-px bg-border" />
            <nav className="flex flex-col gap-1">
              <SideLink to="/" active={pathname === "/"} icon={<SquareCheckBig className="size-4" />} label="工作台" />
              <SideLink to="/projects" active={pathname.startsWith("/projects")} icon={<Kanban className="size-4" />} label="项目" />
            </nav>
          </>
        )}
        <div className="mt-auto px-1 pt-4 text-xs text-faint">{project ? project.summary : "把事项拖到允许的状态列。"}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:hidden">
          <button type="button" className="rounded-[3px] p-2 hover:bg-line" aria-label="打开导航" onClick={() => setNavOpen(true)}>
            <Menu className="size-4" />
          </button>
          <span className="truncate text-sm font-medium">{project ? project.name : "恒川"}</span>
        </div>
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="h-full overflow-auto">{children}</div>
        </main>
      </div>

      {searchOpen ? <NoticePanel /> : null}
      {searchOpenLocal ? <SearchModal onClose={() => setSearchOpenLocal(false)} /> : null}
      <CreateDialog />
      <Toaster position="top-center" />
    </div>
  );
}

function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} className="mb-1 flex size-10 items-center justify-center rounded-[3px] text-white/90 hover:bg-white/10" onClick={onClick}>
      {children}
    </button>
  );
}

function SideLink({ to, active, icon, label }: { to: "/" | "/projects"; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      onClick={() => usePm.getState().setNavOpen(false)}
      className={cn("flex h-10 items-center gap-3 rounded-[3px] px-3 text-sm", active ? "bg-line font-medium text-primary" : "text-fg hover:bg-line")}
    >
      {icon}
      {label}
    </Link>
  );
}

function ProjectLink({
  projectKey,
  to,
  active,
  icon,
  label,
}: {
  projectKey: string;
  to: "/p/$projectKey" | "/p/$projectKey/backlog" | "/p/$projectKey/issues" | "/p/$projectKey/releases";
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      params={{ projectKey }}
      onClick={() => usePm.getState().setNavOpen(false)}
      className={cn("flex h-10 items-center gap-3 rounded-[3px] px-3 text-sm", active ? "bg-line font-medium text-primary" : "text-fg hover:bg-line")}
    >
      {icon}
      {label}
    </Link>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const items = usePm((state) => state.items);
  const projects = usePm((state) => state.projects);
  const goToItem = useGoToItem();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = text ? items.filter((item) => `${item.key} ${item.title}`.toLowerCase().includes(text)) : items.slice(0, 8);
    return list.slice(0, 8);
  }, [items, query]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-[#091e42]/50 p-4 pt-[10vh]" role="presentation" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="搜索事项" className="w-full max-w-[600px] overflow-hidden rounded-[3px] bg-surface shadow-[0_8px_16px_rgba(9,30,66,0.25)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索事项"
            className="h-12 w-full border-0 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <button type="button" aria-label="关闭搜索" className="rounded-[3px] p-1 text-muted hover:bg-line" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        <ul>
          {results.length === 0 ? <li className="px-4 py-6 text-sm text-muted">没有匹配的事项</li> : null}
          {results.map((item) => {
            const project = projects.find((entry) => entry.id === item.projectId);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-line"
                  onClick={() => {
                    onClose();
                    if (project) goToItem(item.id);
                  }}
                >
                  <TypeIcon item={item} />
                  <span className="w-16 shrink-0 text-sm font-medium text-muted">{item.key}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <span className="hidden text-xs text-faint sm:inline">{kindLabel(item)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NoticePanel() {
  const notices = usePm((state) => state.notices);
  const goToItem = useGoToItem();
  return (
    <div className="fixed bottom-4 left-20 z-40 w-80 overflow-hidden rounded-[3px] border border-border bg-surface shadow-[0_8px_16px_rgba(9,30,66,0.25)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium">通知</span>
        <button type="button" aria-label="关闭通知" className="rounded-[3px] p-1 hover:bg-line" onClick={() => usePm.getState().setNoticeOpen(false)}>
          <X className="size-4" />
        </button>
      </div>
      <ul>
        {notices.map((notice) => (
          <li key={notice.id}>
            <button
              type="button"
              className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-line"
              onClick={() => {
                if (notice.itemId) goToItem(notice.itemId);
                usePm.getState().setNoticeOpen(false);
              }}
            >
              <span className="text-sm">{notice.text}</span>
              <span className="text-xs text-faint">{formatRelative(notice.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-muted hover:bg-line"
        onClick={() => {
          usePm.getState().reset();
          toast("已恢复示例数据");
        }}
      >
        <RotateCcw className="size-3.5" />
        恢复示例数据
      </button>
    </div>
  );
}
