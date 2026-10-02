import { useNavigate, useRouter } from "@tanstack/react-router";
import { usePm } from "@/lib/pm/store";
import { isItemPath, readItemOrigin, validReturnHref, type ReturnFocus } from "@/lib/pm/navigation";

export function useItemNavigationState() {
  const router = useRouter();
  return () => {
    const location = router.state.location;
    if (isItemPath(location.pathname))
      return { pmItemOrigin: readItemOrigin(location.state.pmItemOrigin) };
    if (!validReturnHref(location.href)) return { pmItemOrigin: undefined };
    if (typeof document === "undefined") return { pmItemOrigin: undefined };
    const element = document.activeElement as HTMLElement | null;
    const dialog = element?.closest('[role="dialog"]');
    const focus: ReturnFocus = dialog
      ? { label: dialog.getAttribute("aria-label") ?? undefined }
      : {
          key: element?.dataset.focusKey,
          label: element?.getAttribute("aria-label") ?? undefined,
          text: element?.textContent?.trim().slice(0, 300),
          tag:
            element?.tagName === "BUTTON" || element?.tagName === "A" ? element.tagName : undefined,
        };
    return {
      pmItemOrigin: {
        href: location.href,
        index: location.state.__TSR_index,
        focus,
        scrollTop: document.querySelector("main > div")?.scrollTop ?? 0,
        scrollLeft: document.querySelector("main .overflow-x-auto")?.scrollLeft ?? 0,
        columnScroll: Object.fromEntries(
          Array.from(document.querySelectorAll<HTMLElement>("main [data-pm-column]")).map(
            (column) => [column.dataset.pmColumn, column.scrollTop],
          ),
        ),
      },
    };
  };
}

export function useGoToItem() {
  const navigate = useNavigate();
  const itemNavigationState = useItemNavigationState();
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  return (id: string) => {
    const item = items.find((entry) => entry.id === id);
    const project = projects.find((entry) => entry.id === item?.projectId);
    if (!item || !project) return;
    void navigate({
      to: "/p/$projectKey/items/$itemKey",
      params: { projectKey: project.key, itemKey: item.key },
      state: itemNavigationState,
    });
  };
}
