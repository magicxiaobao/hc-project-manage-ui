import { useEffect, useId, useState } from "react";
import { AppModal } from "@/components/biz/app-modal";
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, Bug, CalendarRange, ChartGantt, ClipboardList, Clock3, FlaskConical, FolderTree, GitBranch, Kanban, Layers, LayoutDashboard, ListTree, Package, Server, Settings, SquareCheckBig, SquareKanban, Tag, Users, Waypoints } from "lucide-react";
import type { ReactNode } from "react";
import type { Project } from "@/lib/pm/domain";
import { chosenProjectKey, highlightedModule, moduleDestination, type SidebarModule } from "@/lib/pm/sidebar-nav";
import { useAuthStore } from "@/lib/api/auth-store";
import { useProjectIdByKey } from "@/lib/query/hooks/useProjects";
import { cn } from "@/lib/utils";

export function ProjectSidebar({
  open,
  pathname,
  project,
  projects,
  itemOrigin,
  onClose,
  liveProjectKey,
  accessNav,
}: {
  open: boolean;
  pathname: string;
  project?: Project;
  projects: Project[];
  itemOrigin: unknown;
  onClose: () => void;
  /**
   * Codex review 4175472566：登录态下真实后端项目的键（从 URL 提取）。
   * 演示项目查不到时用它渲染仅含真实后端模块的分支，而不是退回通用分支。
   */
  liveProjectKey?: string | null;
  /**
   * P5 p5-dynamic-route-permission：权限快照派生的授权菜单（桌面侧栏与
   * 移动导航复用同一树），由 shell 注入；未登录/未就绪时为 null。
   */
  accessNav?: ReactNode;
}) {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const liveProject = useProjectIdByKey(liveProjectKey ?? "");
  const liveProjectId = liveProject.isSuccess && typeof liveProject.data === "number" && Number.isSafeInteger(liveProject.data) && liveProject.data > 0 ? liveProject.data : null;
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
  const current = project ? highlightedModule(pathname, project.key, itemOrigin) : undefined;
  // 真实后端项目：只展示已接入真实后端的模块（P1 需求/任务/追溯、P2 缺陷/测试/
  // 版本发布、P3 看板/冲刺/待办/甘特/依赖、P4 仪表盘）；统计/分配/工时/设置仍是
  // 演示数据范围，不在分支里露出来。
  const liveCurrent = liveProjectKey ? highlightedModule(pathname, liveProjectKey, itemOrigin) : undefined;
  // Codex review 4175510487：登录态下 live 分支优先于演示项目分支——
  // 后端项目的 key 撞上演示 seed key 时也走真实后端分支，不渲染演示侧栏。
  const content = (
    <>
        {accessNav != null ? <nav aria-label="权限导航" className="flex min-h-0 flex-1 flex-col overflow-y-auto">{accessNav}</nav> : liveProjectKey ? (
          <>
            <div className="type-section px-1">{liveProjectKey}</div>
            <div className="type-caption px-1">真实后端项目</div>
            <div className="my-4 h-px bg-border" />
            <nav aria-label="项目模块（真实后端）" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <SideLink to="/workbench" active={pathname === "/workbench"} icon={<LayoutDashboard className="size-4" />} label="工作台" onClose={onClose} />
              <SideLink to="/dashboards" active={pathname.startsWith("/dashboards")} icon={<LayoutDashboard className="size-4" />} label="仪表盘管理" onClose={onClose} />
              <div role="group" aria-label="项目" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">项目</h2>
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey" active={liveCurrent === "board"} activeOptions={{ exact: true }} icon={<Kanban className="size-4" />} label="项目详情" onClose={onClose} />
                {liveProjectId !== null ? <ProjectLink projectKey={liveProjectKey} projectId={liveProjectId} to="/dashboard/$projectId" active={pathname.startsWith("/dashboard/")} icon={<LayoutDashboard className="size-4" />} label="项目仪表盘" onClose={onClose} /> : null}
              </div>
              <div role="group" aria-label="需求与任务" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">需求与任务</h2>
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/requirements" active={liveCurrent === "requirements"} icon={<ListTree className="size-4" />} label="需求" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/issues" active={liveCurrent === "issues"} icon={<SquareCheckBig className="size-4" />} label="任务" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/trace" active={liveCurrent === "trace"} icon={<Waypoints className="size-4" />} label="追溯" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/traceability" active={liveCurrent === "traceability"} icon={<Waypoints className="size-4" />} label="需求追溯矩阵" onClose={onClose} />
              </div>
              <div role="group" aria-label="计划与交付" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">计划与交付</h2>
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/boards" active={liveCurrent === "boards"} icon={<SquareKanban className="size-4" />} label="看板" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/backlog" active={liveCurrent === "backlog"} icon={<Layers className="size-4" />} label="待办" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/sprints" active={liveCurrent === "sprints"} icon={<CalendarRange className="size-4" />} label="冲刺" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/gantt" active={liveCurrent === "gantt"} icon={<ChartGantt className="size-4" />} label="甘特图" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/dependencies" active={liveCurrent === "dependencies"} icon={<GitBranch className="size-4" />} label="依赖" onClose={onClose} />
              </div>
              <div role="group" aria-label="质量与发布" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">质量与发布</h2>
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/defects" active={liveCurrent === "defects"} icon={<Bug className="size-4" />} label="缺陷" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/testcases" active={liveCurrent === "testcases"} icon={<ClipboardList className="size-4" />} label="测试用例" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/testsuites" active={liveCurrent === "testsuites"} icon={<FolderTree className="size-4" />} label="测试套件" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/tests" active={liveCurrent === "tests"} icon={<FlaskConical className="size-4" />} label="测试轮" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/versions" active={liveCurrent === "versions"} icon={<Tag className="size-4" />} label="版本" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/releases" active={liveCurrent === "releases"} icon={<Package className="size-4" />} label="发布" onClose={onClose} />
                <ProjectLink projectKey={liveProjectKey} to="/p/$projectKey/release-environments" active={liveCurrent === "release-environments"} icon={<Server className="size-4" />} label="发布环境" onClose={onClose} />
              </div>
            </nav>
          </>
        ) : project ? (
          <>
            <div className="my-4 h-px bg-border" />
            <nav aria-label="项目模块" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div role="group" aria-label="概览" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">概览</h2>
                <ProjectLink projectKey={project.key} to="/p/$projectKey/dashboard" active={current === "dashboard"} icon={<LayoutDashboard className="size-4" />} label="仪表盘" onClose={onClose} />
                <ProjectLink projectKey={project.key} to="/p/$projectKey/stats" active={current === "stats"} icon={<BarChart3 className="size-4" />} label="统计" onClose={onClose} />
              </div>
              <div role="group" aria-label="计划与交付" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">计划与交付</h2>
              <ProjectLink projectKey={project.key} to="/p/$projectKey" active={current === "board"} activeOptions={{ exact: true }} icon={<Kanban className="size-4" />} label="看板" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/backlog" active={current === "backlog"} icon={<Layers className="size-4" />} label="待办" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/sprints" active={current === "sprints"} icon={<CalendarRange className="size-4" />} label="迭代" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/issues" active={current === "issues"} icon={<SquareCheckBig className="size-4" />} label="事项" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/requirements" active={current === "requirements"} icon={<ListTree className="size-4" />} label="需求" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/trace" active={current === "trace"} icon={<Waypoints className="size-4" />} label="追溯" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/traceability" active={current === "traceability"} icon={<Waypoints className="size-4" />} label="需求追溯矩阵" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/gantt" active={current === "gantt"} icon={<ChartGantt className="size-4" />} label="甘特图" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/dependencies" active={current === "dependencies"} icon={<GitBranch className="size-4" />} label="依赖" onClose={onClose} />
              </div>
              <div role="group" aria-label="质量与发布" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">质量与发布</h2>
                <ProjectLink projectKey={project.key} to="/p/$projectKey/defects" active={current === "defects"} icon={<Bug className="size-4" />} label="缺陷" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/tests" active={current === "tests"} icon={<FlaskConical className="size-4" />} label="测试" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/releases" active={current === "releases"} icon={<Package className="size-4" />} label="版本" onClose={onClose} />
              </div>
              <div role="group" aria-label="项目管理" className="flex shrink-0 flex-col gap-1">
                <h2 className="type-label px-3">项目管理</h2>
                <ProjectLink projectKey={project.key} to="/p/$projectKey/assignment" active={current === "assignment"} icon={<Users className="size-4" />} label="分配" onClose={onClose} />
                <ProjectLink projectKey={project.key} to="/p/$projectKey/worklogs" active={current === "worklogs"} icon={<Clock3 className="size-4" />} label="工时" onClose={onClose} />
              <ProjectLink projectKey={project.key} to="/p/$projectKey/settings" active={current === "settings"} icon={<Settings className="size-4" />} label="设置" onClose={onClose} />
              </div>
            </nav>
          </>
        ) : (
          <>
            <div className="type-section px-1">恒川</div>
            <div className="type-caption px-1">项目协作</div>
            <div className="my-4 h-px bg-border" />
            <nav aria-label="全局导航" className="flex flex-col gap-1">
              {authenticated ? <SideLink to="/workbench" active={pathname === "/workbench"} icon={<LayoutDashboard className="size-4" />} label="工作台" onClose={onClose} /> : null}
              <SideLink to="/" active={pathname === "/"} icon={<SquareCheckBig className="size-4" />} label={authenticated ? "演示首页" : "工作台"} onClose={onClose} />
              <SideLink to="/projects" active={pathname.startsWith("/projects")} icon={<Kanban className="size-4" />} label="项目" onClose={onClose} />
            </nav>
          </>
        )}
        <div className="type-caption mt-auto px-1 pt-4">{accessNav != null ? "当前账号授权菜单" : liveProjectKey ? "真实后端项目" : project ? project.summary : "把事项拖到允许的状态列。"}</div>    </>
  );
  return (
    <>
      <aside className="hidden w-[230px] shrink-0 flex-col border-r border-border bg-surface px-4 pt-6 pb-4 lg:flex">
        {/* 4175510487：live 分支优先时不渲染演示项目的名称/切换器（避免 key 碰撞时顶部显示演示项目名） */}
        {accessNav == null && !liveProjectKey && project ? (
          <ProjectName project={project} projects={projects} current={current} onClose={onClose} />
        ) : null}
        {content}
      </aside>
      {compact && open ? (
        <AppModal open title="项目导航" label="项目导航" onClose={onClose} size="sm" dialogClassName="project-nav-dialog" bodyClassName="min-h-0 overflow-auto">
          <div className="flex min-h-0 flex-col">
            {/* 4175510487：live 分支优先时不渲染演示项目的名称/切换器（避免 key 碰撞时顶部显示演示项目名） */}
            {accessNav == null && !liveProjectKey && project ? (
              <ProjectName project={project} projects={projects} current={current} onClose={onClose} />
            ) : null}
            {content}
          </div>
        </AppModal>
      ) : null}
    </>
  );
}

function ProjectName({
  project,
  projects,
  current,
  onClose,
}: {
  project: Project;
  projects: Project[];
  current: SidebarModule | undefined;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="type-section flex size-11 shrink-0 items-center justify-center rounded-sm bg-primary text-surface">{project.key.slice(0, 2)}</span>
      <div className="min-w-0">
        <div className="type-section truncate">{project.name}</div>
        <div className="type-caption truncate">软件项目</div>
        <ProjectSwitcher project={project} projects={projects} current={current} onClose={onClose} />
      </div>
    </div>
  );
}

function ProjectSwitcher({
  project,
  projects,
  current,
  onClose,
}: {
  project: Project;
  projects: Project[];
  current: SidebarModule | undefined;
  onClose: () => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const [chosen, setChosen] = useState(project.key);
  useEffect(() => {
    const next = chosenProjectKey(chosen, projects, project.key);
    if (next !== chosen) setChosen(next);
  }, [projects, project.key, chosen]);
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="type-caption">切换项目</label>
      <select
        id={id}
        className="type-caption h-7 min-w-0 rounded-sm border border-border bg-surface px-1"
        value={chosen}
        onChange={(event) => setChosen(event.target.value)}
      >
        {projects.map((entry) => (
          <option key={entry.id} value={entry.key}>{entry.name}（{entry.key}）</option>
        ))}
      </select>
      <button
        type="button"
        className="type-caption h-7 rounded-sm border border-border px-2"
        onClick={() => {
          const key = chosenProjectKey(chosen, projects, project.key);
          if (key !== chosen || key === project.key || current === undefined) return;
          onClose();
          void navigate({ href: moduleDestination(current, key) });
        }}
      >
        切换
      </button>
    </div>
  );
}

function SideLink({ to, active, icon, label, onClose }: { to: "/" | "/projects" | "/workbench" | "/dashboards"; active: boolean; icon: ReactNode; label: string; onClose: () => void }) {
  return (
    <Link to={to} onClick={onClose} className={cn("flex h-10 items-center gap-3 rounded-sm px-3", active ? "type-emphasis bg-line text-primary" : "type-body hover:bg-line")}>
      {icon}
      {label}
    </Link>
  );
}

function ProjectLink({
  projectKey,
  projectId,
  to,
  active,
  activeOptions,
  icon,
  label,
  onClose,
}: {
  projectKey: string;
  projectId?: number;
  to: "/dashboard/$projectId" | "/p/$projectKey" | "/p/$projectKey/dashboard" | "/p/$projectKey/backlog" | "/p/$projectKey/sprints" | "/p/$projectKey/issues" | "/p/$projectKey/defects" | "/p/$projectKey/assignment" | "/p/$projectKey/requirements" | "/p/$projectKey/trace" | "/p/$projectKey/traceability" | "/p/$projectKey/gantt" | "/p/$projectKey/dependencies" | "/p/$projectKey/tests" | "/p/$projectKey/worklogs" | "/p/$projectKey/releases" | "/p/$projectKey/stats" | "/p/$projectKey/settings" | "/p/$projectKey/boards" | "/p/$projectKey/testcases" | "/p/$projectKey/testsuites" | "/p/$projectKey/versions" | "/p/$projectKey/release-environments";
  active: boolean;
  activeOptions?: { exact: true };
  icon: ReactNode;
  label: string;
  onClose: () => void;
}) {
  return (
    <Link
      to={to}
      params={to === "/dashboard/$projectId" ? { projectId: String(projectId) } : { projectKey }}
      {...(activeOptions ? { activeOptions } : {})}
      onClick={onClose}
      {...(active ? { "aria-current": "page" as const } : {})}
      className={cn("flex h-10 items-center gap-3 rounded-sm px-3", active ? "type-emphasis bg-line text-primary" : "type-body hover:bg-line")}
    >
      {icon}
      {label}
    </Link>
  );
}
