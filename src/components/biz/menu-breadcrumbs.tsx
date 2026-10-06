import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  bindMapping,
  constraintsMatch,
  mapMenuPath,
  matchPage,
  routeManifest,
} from "@/lib/access/route-manifest";
import {
  accessCandidates,
  canAccess,
  type AccessSnapshot,
  type NavigationNode,
} from "@/lib/access/snapshot";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href: string | null;
}

interface Target {
  page: { route: string; title: string };
  params: Record<string, string>;
}

function findChain(
  nodes: readonly NavigationNode[],
  ancestors: readonly NavigationNode[],
  target: Target,
): readonly NavigationNode[] | null {
  for (const node of nodes) {
    const chain = [...ancestors, node];
    if (
      node.mapping &&
      node.mapping.page.route === target.page.route &&
      constraintsMatch(node.mapping, target.params)
    ) {
      return chain;
    }
    const hit = findChain(node.children, chain, target);
    if (hit) return hit;
  }
  return null;
}

/**
 * 按当前精确 route match 对应的菜单祖先链生成面包屑。
 * - 只使用已授权可见导航：不输出无权限菜单名称；
 * - 隐藏项只展示文本，不作为可点击祖先；
 * - 无路径目录展示纯文本；末项不可点击；
 * - 隐藏子页面（如详情页）无独立菜单时，回退到 manifest 声明的继承父菜单链，
 *   再追加静态页面标题。
 */
export function breadcrumbTrail(snapshot: AccessSnapshot, pathname: string): Crumb[] {
  if (snapshot.status !== "ready") return [];
  const target = matchPage(pathname);
  if (!target || !canAccess(snapshot, pathname)) return [];
  let chain = findChain(snapshot.visibleNavigation, [], target);
  let tailTitle: string | null = null;
  if (
    !chain &&
    target.page.inherits &&
    !accessCandidates(snapshot, target).some(
      (entry) => entry.mapping.page.route === target.page.route,
    )
  ) {
    const parent = routeManifest.find((page) => page.route === target.page.inherits);
    if (parent) {
      chain = findChain(snapshot.visibleNavigation, [], { page: parent, params: target.params });
      if (chain) tailTitle = target.page.title;
    }
  }
  if (!chain) {
    const candidates = accessCandidates(snapshot, target).filter((entry) => entry.granted);
    const entry = [...candidates].sort((a, b) => {
      for (let i = 0; i < Math.min(a.chain.length, b.chain.length); i++) {
        const order =
          (a.chain[i].sort ?? 0) - (b.chain[i].sort ?? 0) || a.chain[i].id - b.chain[i].id;
        if (order) return order;
      }
      return a.chain.length - b.chain.length;
    })[0];
    if (!entry) return [];
    chain = entry.chain.map((menu) => ({
      menu,
      mapping: menu.path && menu.openType !== 3 ? mapMenuPath(menu.path) : null,
      externalUrl: null,
      children: [],
    }));
    if (entry.mapping.page.route !== target.page.route) tailTitle = target.page.title;
  }
  const crumbs: Crumb[] = chain.map((node, index) => {
    const last = index === chain.length - 1 && !tailTitle;
    const href =
      !last &&
      node.mapping &&
      !chain!.slice(0, index + 1).some((ancestor) => ancestor.menu.hidden === true)
        ? bindMapping(node.mapping, target.params)
        : null;
    return { label: node.menu.name ?? "未命名菜单", href: last ? null : href };
  });
  if (tailTitle) crumbs.push({ label: tailTitle, href: null });
  return crumbs;
}

export function MenuBreadcrumbs({
  snapshot,
  pathname,
  className,
}: {
  snapshot: AccessSnapshot;
  pathname: string;
  className?: string;
}) {
  const trail = breadcrumbTrail(snapshot, pathname);
  if (!trail.length) return null;
  return (
    <nav aria-label="面包屑" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 type-caption text-fg/70">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? (
                <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />
              ) : null}
              <li className="min-w-0">
                {crumb.href && !last ? (
                  <Link to={crumb.href} className="truncate hover:text-primary hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="block truncate">
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
