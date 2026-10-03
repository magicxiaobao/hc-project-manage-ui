import { useLayoutEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { RotateCcw, X } from "lucide-react";
import type { Notice } from "@/lib/pm/domain";
import { formatRelative, NOTICE_KIND_LABEL } from "@/lib/pm/domain";

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element || element === document.body || !element.isConnected) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

export function NoticePanel({
  notices,
  onClose,
  onOpen,
  onReset,
}: {
  notices: Notice[];
  onClose: () => void;
  onOpen: (itemId: string) => void;
  onReset: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const activeBeforeOpen = document.activeElement;
    const previous =
      activeBeforeOpen instanceof HTMLElement && activeBeforeOpen !== document.body
        ? activeBeforeOpen
        : null;
    closeButtonRef.current?.focus();
    return () => {
      const active = document.activeElement;
      // body or null is not inside the panel: leave focus where it is, never steal it back to the bell.
      if (active == null || active === document.body) return;
      if (!root || !root.contains(active)) return;
      // Do not pull focus out of a real modal (aria-modal absent or not "false").
      if (active instanceof Element && active.closest('[role="dialog"]:not([aria-modal="false"])')) return;
      if (!canRestoreFocus(previous)) return;
      previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-label="通知"
      className="fixed bottom-4 left-4 z-40 flex max-h-[calc(100dvh-2rem)] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-sm border border-border bg-surface shadow-pop sm:left-20 sm:max-w-[calc(100vw-6rem)]"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="type-emphasis">通知</span>
        <Link to="/inbox" className="type-link" onClick={onClose}>
          通知中心
        </Link>
        <button ref={closeButtonRef} type="button" aria-label="关闭通知" className="rounded-sm p-1 hover:bg-line" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <ul className="min-h-0 overflow-y-auto overscroll-contain">
        {notices.map((notice) => (
          <li key={notice.id}>
            <button
              type="button"
              className="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-line"
              onClick={() => {
                if (notice.itemId) onOpen(notice.itemId);
                onClose();
              }}
            >
              <span className="type-body">{notice.text}</span>
              <span className="type-caption">{NOTICE_KIND_LABEL[notice.kind]} · {formatRelative(notice.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="type-caption flex w-full shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-line" onClick={onReset}>
        <RotateCcw className="size-3.5" />
        恢复示例数据
      </button>
    </div>
  );
}
