import { Link } from "@tanstack/react-router";
import { RotateCcw, X } from "lucide-react";
import type { Notice } from "@/lib/pm/domain";
import { formatRelative } from "@/lib/pm/domain";

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
  return (
    <div className="fixed bottom-4 left-20 z-40 w-80 overflow-hidden rounded-sm border border-border bg-surface shadow-pop">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="type-emphasis">通知</span>
        <Link to="/inbox" className="type-link" onClick={onClose}>
          通知中心
        </Link>
        <button type="button" aria-label="关闭通知" className="rounded-sm p-1 hover:bg-line" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <ul>
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
              <span className="type-caption">{formatRelative(notice.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="type-caption flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-line" onClick={onReset}>
        <RotateCcw className="size-3.5" />
        恢复示例数据
      </button>
    </div>
  );
}
