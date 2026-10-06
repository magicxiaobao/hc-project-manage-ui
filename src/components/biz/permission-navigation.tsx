import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Folder,
  Home,
  Kanban,
  KeyRound,
  LayoutDashboard,
  List,
  ListTree,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  User,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { NavigationNode } from "@/lib/access/snapshot";
import { bindMapping } from "@/lib/access/route-manifest";
import { cn } from "@/lib/utils";

/**
 * 菜单 icon 白名单：后端 menu.icon 为自由字符串，只识别已知别名，
 * 未知一律用普通菜单图标，不做动态 import。
 */
const ICONS: Record<string, LucideIcon> = {
  user: User,
  users: Users,
  role: ShieldCheck,
  roles: ShieldCheck,
  permission: KeyRound,
  permissions: KeyRound,
  menu: ListTree,
  menus: ListTree,
  setting: Settings,
  settings: Settings,
  dashboard: LayoutDashboard,
  home: Home,
  bell: Bell,
  clock: Clock3,
  search: Search,
  file: FileText,
  chart: BarChart3,
  project: Kanban,
  projects: Kanban,
  folder: Folder,
  tag: Tag,
  wrench: Wrench,
};
function iconFor(raw: string | null): LucideIcon {
  if (!raw) return List;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/^(?:el-|icon-)+/, "")
    .replace(/[-_\s]/g, "");
  return ICONS[key] ?? List;
}

/** 树过滤：保留 include 的节点；仅子节点命中时退化为分组容器。 */
function filterNodes(
  nodes: readonly NavigationNode[],
  include: (node: NavigationNode) => boolean,
): NavigationNode[] {
  const out: NavigationNode[] = [];
  for (const node of nodes) {
    const children = filterNodes(node.children, include);
    if (include(node)) out.push({ ...node, children });
    else if (children.length) out.push({ ...node, mapping: null, externalUrl: null, children });
  }
  return out;
}

/**
 * 项目模式：只展示能绑定当前真实 projectKey 的节点（模板菜单的固定
 * 参数约束必须匹配，不拿演示/首个项目填参数）。
 * excludeRoutes：调用方已用硬编码分支覆盖的已实现页面，避免重复展示。
 */
export function projectNavigation(
  nodes: readonly NavigationNode[],
  projectKey: string,
  excludeRoutes: ReadonlySet<string> = new Set(),
): NavigationNode[] {
  const params = { projectKey };
  return filterNodes(
    nodes,
    (node) =>
      !!node.mapping &&
      node.mapping.page.route.startsWith("/p/") &&
      !excludeRoutes.has(node.mapping.page.route) &&
      bindMapping(node.mapping, params) !== null,
  );
}

/** 系统模式：sys 子树 + 非项目域的合法全局入口；按钮与未映射节点本就不在快照导航里。 */
export function systemNavigation(nodes: readonly NavigationNode[]): NavigationNode[] {
  return filterNodes(nodes, (node) => {
    const route = node.mapping?.page.route;
    return !!node.externalUrl || (!!route && !route.startsWith("/p/"));
  });
}

export function PermissionNavigation({
  nodes,
  pathname,
  params,
  onNavigate,
  emptyHint = "暂无可访问菜单",
}: {
  nodes: readonly NavigationNode[];
  pathname: string;
  /** 绑定参数化映射（如 { projectKey }）；模板约束仍优先。 */
  params?: Readonly<Record<string, string>>;
  onNavigate?: () => void;
  emptyHint?: string;
}) {
  if (!nodes.length) {
    return <p className="type-caption px-3 py-2">{emptyHint}</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <NavItem
          key={node.menu.id}
          node={node}
          pathname={pathname}
          params={params}
          onNavigate={onNavigate}
          depth={0}
        />
      ))}
    </ul>
  );
}

function NavItem({
  node,
  pathname,
  params,
  onNavigate,
  depth,
}: {
  node: NavigationNode;
  pathname: string;
  params?: Readonly<Record<string, string>>;
  onNavigate?: () => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const href = node.mapping ? bindMapping(node.mapping, params ?? {}) : null;
  const Icon =
    node.children.length && !href && !node.externalUrl ? Folder : iconFor(node.menu.icon);
  const active = !!href && pathname.replace(/\/+$/, "") === href.replace(/\/+$/, "");
  useEffect(() => {
    setExpanded(true);
  }, [pathname, node]);
  const linkClass = (isActive: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left type-body",
      isActive ? "bg-primary-soft text-primary font-medium" : "text-fg hover:bg-line",
    );

  if (node.externalUrl) {
    return (
      <li>
        <a
          href={node.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass(false)}
          onClick={onNavigate}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{node.menu.name}</span>
          <ExternalLink className="size-3.5 shrink-0 opacity-60" aria-hidden />
        </a>
        {node.children.length ? (
          <ul className="ml-4 flex flex-col gap-0.5 border-l border-border pl-2">
            {node.children.map((child) => (
              <NavItem
                key={child.menu.id}
                node={child}
                pathname={pathname}
                params={params}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  if (href) {
    return (
      <li>
        <Link
          to={href}
          className={linkClass(active)}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{node.menu.name}</span>
        </Link>
        {node.children.length ? (
          <ul className="ml-4 flex flex-col gap-0.5 border-l border-border pl-2">
            {node.children.map((child) => (
              <NavItem
                key={child.menu.id}
                node={child}
                pathname={pathname}
                params={params}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  // 无路径目录：只作分组，点击展开/收起或定位，不生成不存在的组件页。
  if (node.children.length) {
    return (
      <li>
        <button
          type="button"
          className={linkClass(false)}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{node.menu.name}</span>
          <ChevronDown
            className={cn("size-3.5 shrink-0 transition-transform", !expanded && "-rotate-90")}
            aria-hidden
          />
        </button>
        {expanded ? (
          <ul className="ml-4 flex flex-col gap-0.5 border-l border-border pl-2">
            {node.children.map((child) => (
              <NavItem
                key={child.menu.id}
                node={child}
                pathname={pathname}
                params={params}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }
  return null;
}
