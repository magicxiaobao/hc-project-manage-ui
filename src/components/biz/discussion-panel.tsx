import { Tabs } from "@heroui/react";
import { useState } from "react";
import type { Comment, FeedEntry, ItemKind, LifecycleRecord, Person } from "@/lib/pm/domain";
import { ActivityList, HistoryList } from "@/components/biz/activity-list";
import { CommentThread } from "@/components/biz/comment-thread";
import { commentDrafts, commentSubmitted } from "@/lib/pm/edit-rules";

type Tab = "comment" | "feed" | "history";

export function DiscussionPanel({
  itemId,
  comments,
  feeds,
  histories,
  people,
  kind,
  onComment,
}: {
  itemId: string;
  comments: Comment[];
  feeds: FeedEntry[];
  histories: LifecycleRecord[];
  people: Person[];
  kind: ItemKind;
  onComment: (body: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("comment");
  const [draft, setDraft] = useState(() => commentDrafts.get(itemId) ?? "");
  const writeDraft = (value: string) => {
    commentDrafts.set(itemId, value);
    setDraft(value);
  };
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
          onDraft={writeDraft}
          onSubmit={() => {
            if (!commentSubmitted(draft)) return;
            onComment(draft);
            commentDrafts.delete(itemId);
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
