import { Link } from "@tanstack/react-router";
import { BarChart3, Bug, CalendarRange, ChartGantt, Clock3, FlaskConical, GitBranch, Kanban, Layers, LayoutDashboard, ListTree, Package, Settings, SquareCheckBig, Users, Waypoints, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Project } from "@/lib/pm/domain";
import { cn } from "@/lib/utils";

export function ProjectSidebar({
  open,
  pathname,
  project,
  onClose,
}: {
  open: boolean;
  pathname: string;
  project?: Project;
  onClose: () => void;
}) {
  return (
    <>
      {open ? <button type="button" aria-label="关闭导航" className="fixed inset-0 z-20 bg-scrim/40 md:hidden" onClick={onClose} /> : null}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-16 z-30 w-[230px] flex-col border-r border-border bg-surface px-4 pt-6 pb-4 md:static md:z-0 md:flex",
          open ? "flex" : "hidden",
        )}
      >
        <button type="button" className="mb-3 self-end rounded-sm p-1 text-muted hover:bg-line md:hidden" aria-label="关闭侧栏" onClick={onClose}>
          <X className="size-4" />
        </button>
        {project ? (
          <>
            <div className="flex items-center gap-3 px-1">
              <span className="type-section flex size-11 shrink-0 items-center justify-center rounded-sm bg-primary text-surface">{project.key.slice(0, 2)}</span>
              <div className="min-w-0">
                <div className="type-section truncate">{project.name}</div>
                <div className="type-caption truncate">软件项目</div>
              </div>
            </div>
            <div className="my-4 h-px bg-border" />
            <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              <ProjectLink projectKey={project.key} to="/p/$projectKey" active={pathname === `/p/${project.key}`} icon={<Kanban className="size-4" />} label="看板" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/dashboard" active={pathname.endsWith("/dashboard")} icon={<LayoutDashboard className="size-4" />} label="仪表盘" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/backlog" active={pathname.endsWith("/backlog")} icon={<Layers className="size-4" />} label="待办" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/sprints" active={pathname.endsWith("/sprints")} icon={<CalendarRange className="size-4" />} label="迭代" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/issues" active={pathname.includes("/issues") || pathname.includes("/items/")} icon={<SquareCheckBig className="size-4" />} label="事项" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/defects" active={pathname.endsWith("/defects")} icon={<Bug className="size-4" />} label="缺陷" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/assignment" active={pathname.endsWith("/assignment")} icon={<Users className="size-4" />} label="分配" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/requirements" active={pathname.endsWith("/requirements")} icon={<ListTree className="size-4" />} label="需求" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/trace" active={pathname.endsWith("/trace")} icon={<Waypoints className="size-4" />} label="追溯" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/gantt" active={pathname.endsWith("/gantt")} icon={<ChartGantt className="size-4" />} label="甘特图" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/dependencies" active={pathname.endsWith("/dependencies")} icon={<GitBranch className="size-4" />} label="依赖" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/tests" active={pathname.endsWith("/tests")} icon={<FlaskConical className="size-4" />} label="测试" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/worklogs" active={pathname.endsWith("/worklogs")} icon={<Clock3 className="size-4" />} label="工时" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/releases" active={pathname.endsWith("/releases")} icon={<Package className="size-4" />} label="版本" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/stats" active={pathname.endsWith("/stats")} icon={<BarChart3 className="size-4" />} label="统计" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/settings" active={pathname.endsWith("/settings")} icon={<Settings className="size-4" />} label="设置" onClose={onClose} />
            </nav>
          </>
        ) : (
          <>
            <div className="type-section px-1">恒川</div>
            <div className="type-caption px-1">项目协作</div>
            <div className="my-4 h-px bg-border" />
            <nav className="flex flex-col gap-1">
              <SideLink to="/" active={pathname === "/"} icon={<SquareCheckBig className="size-4" />} label="工作台" onClose={onClose} />
              <SideLink to="/projects" active={pathname.startsWith("/projects")} icon={<Kanban className="size-4" />} label="项目" onClose={onClose} />
            </nav>
          </>
        )}
        <div className="type-caption mt-auto px-1 pt-4">{project ? project.summary : "把事项拖到允许的状态列。"}</div>
      </aside>
    </>
  );
}

function SideLink({ to, active, icon, label, onClose }: { to: "/" | "/projects"; active: boolean; icon: ReactNode; label: string; onClose: () => void }) {
  return (
    <Link to={to} onClick={onClose} className={cn("flex h-10 items-center gap-3 rounded-sm px-3", active ? "type-emphasis bg-line text-primary" : "type-body hover:bg-line")}>
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
  onClose,
}: {
  projectKey: string;
  to: "/p/$projectKey" | "/p/$projectKey/dashboard" | "/p/$projectKey/backlog" | "/p/$projectKey/sprints" | "/p/$projectKey/issues" | "/p/$projectKey/defects" | "/p/$projectKey/assignment" | "/p/$projectKey/requirements" | "/p/$projectKey/trace" | "/p/$projectKey/gantt" | "/p/$projectKey/dependencies" | "/p/$projectKey/tests" | "/p/$projectKey/worklogs" | "/p/$projectKey/releases" | "/p/$projectKey/stats" | "/p/$projectKey/settings";
  active: boolean;
  icon: ReactNode;
  label: string;
  onClose: () => void;
}) {
  return (
    <Link
      to={to}
      params={{ projectKey }}
      onClick={onClose}
      className={cn("flex h-10 items-center gap-3 rounded-sm px-3", active ? "type-emphasis bg-line text-primary" : "type-body hover:bg-line")}
    >
      {icon}
      {label}
    </Link>
  );
}
