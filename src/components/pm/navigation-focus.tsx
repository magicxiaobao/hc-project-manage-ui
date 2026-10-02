import { useRouter, useRouterState } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import type { ColumnId } from "@/lib/pm/domain";
import { isItemPath, readItemOrigin, type ItemOrigin } from "@/lib/pm/navigation";

let pendingOrigin: ItemOrigin | undefined;

export function NavigationFocus({ ready }: { ready: boolean }) {
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const status = useRouterState({ select: (state) => state.status });
  const resolvedKey = useRouterState({
    select: (state) => state.resolvedLocation?.state.__TSR_key,
  });
  useLayoutEffect(() => {
    if (!ready) return;
    if (isItemPath(location.pathname)) {
      pendingOrigin = readItemOrigin(location.state.pmItemOrigin) ?? {
        href: location.pathname.split("/items/")[0],
        index: location.state.__TSR_index,
        focus: {},
        scrollTop: 0,
        scrollLeft: 0,
      };
      return;
    }
    // A refreshed detail may return to a source route whose chunk is still loading.
    if (status !== "idle" || resolvedKey !== location.state.__TSR_key) return;
    const origin = pendingOrigin;
    pendingOrigin = undefined;
    if (!origin || origin.href !== location.href) return;
    const frame = requestAnimationFrame(() => {
      if (
        router.state.location.state.__TSR_key !== location.state.__TSR_key ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a, select"));
      const target =
        candidates.find(
          (element) => origin.focus.key && element.dataset.focusKey === origin.focus.key,
        ) ??
        candidates.find(
          (element) =>
            origin.focus.label && element.getAttribute("aria-label") === origin.focus.label,
        ) ??
        candidates.find(
          (element) =>
            origin.focus.tag === element.tagName &&
            origin.focus.text &&
            element.textContent?.trim() === origin.focus.text,
        );
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!target && heading) heading.tabIndex = -1;
      (target ?? heading)?.focus({ preventScroll: true });
      const main = document.querySelector("main > div");
      if (main) main.scrollTop = origin.scrollTop;
      const board =
        document.querySelector("main [data-pm-board-scroll]") ??
        document.querySelector("main .overflow-x-auto");
      if (board) board.scrollLeft = origin.scrollLeft;
      for (const column of document.querySelectorAll<HTMLElement>("main [data-pm-column]")) {
        const top = origin.columnScroll?.[column.dataset.pmColumn as ColumnId];
        if (top !== undefined) column.scrollTop = top;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, location, status, resolvedKey, router]);
  return null;
}
