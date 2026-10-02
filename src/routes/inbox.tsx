import { AppShell } from "@/components/pm/shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { EmptyHint, PageHeading } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { formatRelative } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

export const Route = createFileRoute("/inbox")({
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <Body />
    </AppShell>
  );
}

function Body() {
  const notices = usePm((state) => state.notices);
  const goToItem = useGoToItem();
  const unread = notices.filter((notice) => !notice.read).length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Link to="/" className="type-link w-fit hover:underline">
        返回工作台
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="通知中心" hint={unread ? `${unread} 条未读。` : "没有未读通知。"} />
        <Button variant="outline" onPress={() => usePm.getState().markNoticesRead()}>
          全部已读
        </Button>
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {notices.length === 0 ? <EmptyHint>还没有通知。</EmptyHint> : null}
        {notices.map((notice) => (
          <button
            key={notice.id}
            data-focus-key={`notice:${notice.id}`}
            type="button"
            className="flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-line"
            onClick={() => {
              usePm.getState().markNoticeRead(notice.id);
              if (notice.itemId) goToItem(notice.itemId);
            }}
          >
            <span className={notice.read ? "type-body" : "type-emphasis"}>{notice.text}</span>
            <span className="type-caption">{formatRelative(notice.createdAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
