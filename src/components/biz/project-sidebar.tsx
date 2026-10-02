import { useEffect, useState } from "react";
import { AppModal } from "@/components/biz/app-modal";
import { Link } from "@tanstack/react-router";
import { BarChart3, Bug, CalendarRange, ChartGantt, Clock3, FlaskConical, GitBranch, Kanban, Layers, LayoutDashboard, ListTree, Package, Settings, SquareCheckBig, Users, Waypoints } from "lucide-react";
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
  const [compact, setCompact] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setCompact(media.matches);
      if (!media.matches) onClose();
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [onClose]);
  const content = (
    <>
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
            <nav aria-label="项目模块" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div role="group" aria-label="概览" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">概览</h2>
                <ProjectLink projectKey={project.key} to="/p/$projectKey/dashboard" active={pathname.endsWith("/dashboard")} icon={<LayoutDashboard className="size-4" />} label="仪表盘" onClose={onClose} />
                <ProjectLink projectKey={project.key} to="/p/$projectKey/stats" active={pathname.endsWith("/stats")} icon={<BarChart3 className="size-4" />} label="统计" onClose={onClose} />
              </div>
              <div role="group" aria-label="计划与交付" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">计划与交付</h2>
              <ProjectLink projectKey={project.key} to="/p/$projectKey" active={pathname === `/p/${project.key}`} icon={<Kanban className="size-4" />} label="看板" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/backlog" active={pathname.endsWith("/backlog")} icon={<Layers className="size-4" />} label="待办" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/sprints" active={pathname.endsWith("/sprints")} icon={<CalendarRange className="size-4" />} label="迭代" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/issues" active={pathname.includes("/issues") || pathname.includes("/items/")} icon={<SquareCheckBig className="size-4" />} label="事项" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/requirements" active={pathname.endsWith("/requirements")} icon={<ListTree className="size-4" />} label="需求" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/trace" active={pathname.endsWith("/trace")} icon={<Waypoints className="size-4" />} label="追溯" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/gantt" active={pathname.endsWith("/gantt")} icon={<ChartGantt className="size-4" />} label="甘特图" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/dependencies" active={pathname.endsWith("/dependencies")} icon={<GitBranch className="size-4" />} label="依赖" onClose={onClose} />
              </div>
              <div role="group" aria-label="质量与发布" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">质量与发布</h2>
                <ProjectLink projectKey={project.key} to="/p/$projectKey/defects" active={pathname.endsWith("/defects")} icon={<Bug className="size-4" />} label="缺陷" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/tests" active={pathname.endsWith("/tests")} icon={<FlaskConical className="size-4" />} label="测试" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/releases" active={pathname.endsWith("/releases")} icon={<Package className="size-4" />} label="版本" onClose={onClose} />
              </div>
              <div role="group" aria-label="项目管理" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">项目管理</h2>
                <ProjectLink projectKey={project.key} to="/p/$projectKey/assignment" active={pathname.endsWith("/assignment")} icon={<Users className="size-4" />} label="分配" onClose={onClose} />
                <ProjectLink projectKey={project.key} to="/p/$projectKey/worklogs" active={pathname.endsWith("/worklogs")} icon={<Clock3 className="size-4" />} label="工时" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/settings" active={pathname.endsWith("/settings")} icon={<Settings className="size-4" />} label="设置" onClose={onClose} />
              </div>
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
    </>
  );
  return (
    <>
      <aside className="hidden w-[230px] shrink-0 flex-col border-r border-border bg-surface px-4 pt-6 pb-4 lg:flex">
        {content}
      </aside>
      {compact && open ? (
        <AppModal open title="项目导航" label="项目导航" onClose={onClose} size="sm" dialogClassName="project-nav-dialog" bodyClassName="min-h-0 overflow-auto">
          <div className="flex min-h-0 flex-col">{content}</div>
        </AppModal>
      ) : null}
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
