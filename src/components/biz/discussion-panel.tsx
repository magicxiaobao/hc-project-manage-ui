import { Tabs } from "@heroui/react";
import { useState } from "react";
import { toast } from "sonner";
import type { Comment, FeedEntry, ItemKind, LifecycleRecord, Person } from "@/lib/pm/domain";
import { ActivityList, HistoryList } from "@/components/biz/activity-list";
import { CommentThread } from "@/components/biz/comment-thread";
import type { PmActionResult } from "@/lib/pm/store";

type Tab = "comment" | "feed" | "history";

export function DiscussionPanel({
  comments,
  feeds,
  histories,
  people,
  kind,
  onComment,
}: {
  comments: Comment[];
  feeds: FeedEntry[];
  histories: LifecycleRecord[];
  people: Person[];
  kind: ItemKind;
  onComment: (body: string) => PmActionResult;
}) {
  const [tab, setTab] = useState<Tab>("comment");
  const [draft, setDraft] = useState("");
  return (
    <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key) as Tab)}>
      <Tabs.ListContainer>
        <Tabs.List aria-label="讨论">
          <Tabs.Tab id="comment">
            评论 {comments.length}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="feed">
            对象动态
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="history">
            生命周期历史
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="comment">
        <CommentThread
          comments={comments}
          people={people}
          draft={draft}
          onDraft={setDraft}
          onSubmit={() => {
            if (!draft.trim()) return;
            const result = onComment(draft);
            if (!result.ok) {
              toast.error(result.message ?? "评论提交失败");
              return;
            }
            setDraft("");
          }}
        />
      </Tabs.Panel>
      <Tabs.Panel id="feed">
        <ActivityList feeds={feeds} people={people} />
      </Tabs.Panel>
      <Tabs.Panel id="history">
        <HistoryList histories={histories} people={people} kind={kind} />
      </Tabs.Panel>
    </Tabs>
  );
}
