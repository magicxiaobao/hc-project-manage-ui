import { AppShell } from "@/components/pm/shell";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { useState } from "react";
import { EmptyHint, PageHeading } from "@/components/biz";
import { useGoToItem } from "@/components/pm/use-go-item";
import { formatRelative, NOTICE_KIND_LABEL, type NoticeKind } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

export const Route = createFileRoute("/inbox")({
  component: Page,
});

let remembered: "unread" | "all" = "unread";
let rememberedKind = "";

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
  const [filter, setFilter] = useState(remembered);
  const [kind, setKind] = useState(rememberedKind);
  const unread = notices.filter((notice) => !notice.read).length;
  const shown = notices.filter(
    (notice) => (filter === "all" || !notice.read) && (kind === "" || notice.kind === kind),
  );
  const choose = (next: "unread" | "all") => {
    remembered = next;
    setFilter(next);
  };
  const chooseKind = (next: string) => {
    rememberedKind = next;
    setKind(next);
  };
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <Link to="/" className="type-link w-fit hover:underline">
        返回工作台
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="通知中心" hint={unread ? `${unread} 条未读。` : "没有未读通知。"} />
        <div className="flex gap-2">
          <Button
            variant={filter === "unread" ? "primary" : "outline"}
            onPress={() => choose("unread")}
          >
            未读
          </Button>
          <Button variant={filter === "all" ? "primary" : "outline"} onPress={() => choose("all")}>
            全部
          </Button>
          <Button variant="outline" onPress={() => usePm.getState().markNoticesRead()}>
            全部已读
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={kind === "" ? "primary" : "outline"} onPress={() => chooseKind("")}>
          全部类型
        </Button>
        {(Object.keys(NOTICE_KIND_LABEL) as NoticeKind[]).map((id) => (
          <Button
            key={id}
            variant={kind === id ? "primary" : "outline"}
            onPress={() => chooseKind(id)}
          >
            {NOTICE_KIND_LABEL[id]}
          </Button>
        ))}
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {shown.length === 0 ? (
          <EmptyHint>{filter === "unread" ? "没有未读通知。" : "还没有通知。"}</EmptyHint>
        ) : null}
        {shown.map((notice) => (
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
            <span className="type-caption">
              {NOTICE_KIND_LABEL[notice.kind]} · {formatRelative(notice.createdAt)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
