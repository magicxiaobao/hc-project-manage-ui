import { useLayoutEffect, useRef, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { RotateCcw, X } from "lucide-react";
import type { Notice } from "@/lib/pm/domain";
import { formatRelative, NOTICE_KIND_LABEL } from "@/lib/pm/domain";

export function NoticePanel({
  notices,
  triggerRef,
  onClose,
  onOpen,
  onReset,
}: {
  notices: Notice[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpen: (itemId: string) => void;
  onReset: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    closeButtonRef.current?.focus();
    return () => trigger?.focus();
  }, [triggerRef]);

  return (
    <div
      role="dialog"
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
