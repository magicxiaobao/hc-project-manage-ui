import { notFound, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../api/auth-store";
import { resolvePostLoginTarget } from "../auth/login-redirect";
import { canAccess, landingPath } from "./snapshot";
import { matchPage, normalizeInternalPath } from "./route-manifest";
import { refreshAccess } from "./service";

/** Router exposes the matched fullPath even for a fuzzy 404 parent. Only a
 * complete registered target is a page; unlisted pages default to deny. */
export function isRegisteredTarget(
  matches: readonly { routeId: unknown; fullPath?: unknown }[],
  pathname: string,
): boolean {
  const final = matches.at(-1);
  if (!final || final.routeId === "__root__" || typeof final.fullPath !== "string") return false;
  const segments = (path: string) => path.replace(/\/+$/, "").split("/").filter(Boolean);
  return segments(final.fullPath).length === segments(pathname).length;
}

export async function guardAccess({
  location,
  queryClient,
  registeredPage = false,
}: {
  location: { pathname: string; href: string };
  queryClient: QueryClient;
  registeredPage?: boolean;
}): Promise<void> {
  useAuthStore.getState().hydrate();
  const path = normalizeInternalPath(location.pathname) ?? location.pathname;
  if (path === "/403") return;
  if (path === "/login") {
    // Existing login UI consumes a redirect search value. Canonicalize its default
    // here to the authorized landing dispatcher without changing the legacy form.
    const search = new URL(location.href, "http://localhost").searchParams;
    const target = resolvePostLoginTarget(search.get("redirect"));
    if (!target || ["/login", "/403"].includes(target.split(/[?#]/, 1)[0]))
      throw redirect({ to: "/login", search: { redirect: "/" }, replace: true });
    return;
  }
  // Unknown URLs are left to the router's 404. Known but unlisted business pages are denied.
  const page = matchPage(path);
  if (path === "/sys") return; // Outlet-only initialization shell, no business page.
  if (!page && path !== "/" && !registeredPage) throw notFound();
  if (!useAuthStore.getState().isAuthenticated)
    throw redirect({
      to: "/login",
      search: { redirect: resolvePostLoginTarget(location.href) },
      replace: true,
    });
  const snapshot = await refreshAccess({ queryClient });
  if (path === "/") throw redirect({ href: landingPath(snapshot) ?? "/403", replace: true });
  if (!canAccess(snapshot, path)) throw redirect({ to: "/403", replace: true });
}
