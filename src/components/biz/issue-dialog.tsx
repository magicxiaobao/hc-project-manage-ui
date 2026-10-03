import { Link } from "@tanstack/react-router";
import { Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";
import { toast } from "sonner";
import { AppModal } from "@/components/biz/app-modal";
import { useItemNavigationState } from "@/components/pm/use-go-item";
import { ChildIssueList } from "@/components/biz/child-issue-list";
import { DiscussionPanel } from "@/components/biz/discussion-panel";
import { IssueMeta } from "@/components/biz/issue-meta";
import { IssueProperties } from "@/components/biz/issue-properties";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";
import { SeverityChip, StatusChip } from "@/components/biz/status-chip";
import { TransitionBar } from "@/components/biz/transition-bar";
import type {
  Comment,
  FeedEntry,
  LifecycleRecord,
  Person,
  ReleaseVersion,
  Sprint,
  WorkItem,
} from "@/lib/pm/domain";
import { formatRelative, kindLabel, needsReason } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { PersistenceStatus } from "@/components/biz/persistence-status";

export function IssueDialog({
  projectKey,
  item,
  people,
  sprints,
  versions,
  parent,
  children,
  comments,
  feeds,
  histories,
  onClose,
  onPatch,
  onTransition,
  onComment,
  onClone,
  previous,
  next,
}: {
  projectKey: string;
  item: WorkItem;
  people: Person[];
  sprints: Sprint[];
  versions: ReleaseVersion[];
  parent?: WorkItem;
  children: WorkItem[];
  comments: Comment[];
  feeds: FeedEntry[];
  histories: LifecycleRecord[];
  onClose: () => void;
  onPatch: (
    patch: Partial<
      Pick<
        WorkItem,
        | "title"
        | "description"
        | "priority"
        | "assigneeId"
        | "sprintId"
        | "versionId"
        | "storyPoints"
        | "progress"
        | "dueDate"
        | "tags"
      >
    >,
  ) => void;
  onTransition: (to: string, reason?: string) => { ok: true } | { ok: false; message: string };
  onComment: (body: string) => void;
  onClone: () => void;
  previous?: WorkItem;
  next?: WorkItem;
}) {
  const itemNavigationState = useItemNavigationState();
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const ready = usePm((state) => state.ready);
  const persistenceError = usePm((state) => state.persistenceError);

  const apply = (to: string, given?: string) => {
    const result = onTransition(to, given);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    setPending(null);
    setReason("");
  };

  return (
    <AppModal
      open
      title={
        <>
          <IssueTypeIcon item={item} />
          <span className="type-overline">{kindLabel(item)}</span>
          <span className="type-link">{item.key}</span>
          <StatusChip kind={item.kind} status={item.status} />
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {previous ? (
              <Link
                state={itemNavigationState}
                to="/p/$projectKey/items/$itemKey"
                params={{ projectKey, itemKey: previous.key }}
                className="type-link"
              >
                上一张
              </Link>
            ) : null}
            {next ? (
              <Link
                state={itemNavigationState}
                to="/p/$projectKey/items/$itemKey"
                params={{ projectKey, itemKey: next.key }}
                className="type-link"
              >
                下一张
              </Link>
            ) : null}
            <button type="button" className="type-link" onClick={onClone}>
              克隆
            </button>
          </span>
        </>
      }
      label={item.key}
      onClose={onClose}
      dialogClassName="max-w-[1040px] rounded-sm"
      bodyClassName="min-h-0 p-0"
    >
      <div className="shrink-0 border-b border-border bg-surface px-5 py-2">
        <PersistenceStatus ready={ready} error={persistenceError} automatic onRetry={() => usePm.getState().retryPersistence()} />
      </div>
      <div className="grid min-h-0 flex-1 gap-6 overflow-auto px-5 py-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          {parent ? (
            <Link
              state={itemNavigationState}
              to="/p/$projectKey/items/$itemKey"
              params={{ projectKey, itemKey: parent.key }}
              className="type-link inline-block hover:underline"
            >
              {parent.key} {parent.title}
            </Link>
          ) : null}
          <input
            value={item.title}
            aria-label="标题"
            onChange={(event) => onPatch({ title: event.target.value })}
            className="type-title mt-2 w-full border-0 bg-transparent outline-none"
          />
          <div className="mt-4">
            <TransitionBar
              item={item}
              pending={pending}
              reason={reason}
              onPick={(to) => {
                if (needsReason(to)) {
                  setPending(to);
                  return;
                }
                apply(to);
              }}
              onReason={setReason}
              onConfirm={() => pending && apply(pending, reason)}
              onCancel={() => setPending(null)}
            />
          </div>
          <div className="mt-5">
            <TextField
              value={item.description}
              onChange={(description) => onPatch({ description })}
            >
              <Label>描述</Label>
              <TextArea rows={5} />
            </TextField>
          </div>
          {item.kind === "defect" ? (
            <div className="type-meta mt-3 flex items-center gap-2">
              <span>{item.defectType}</span>
              {item.severity ? <SeverityChip severity={item.severity} /> : null}
            </div>
          ) : null}
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <IssueProperties
            key={item.id}
            item={item}
            people={people}
            sprints={sprints}
            versions={versions}
            onPatch={onPatch}
          />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <ChildIssueList projectKey={projectKey} items={children} parent={item} />
          <div className="mt-6">
            <DiscussionPanel
              key={item.id}
              itemId={item.id}
              comments={comments}
              feeds={feeds}
              histories={histories}
              people={people}
              kind={item.kind}
              onComment={onComment}
            />
          </div>
          <p className="type-caption mt-6">
            <IssueMeta item={item} /> · 更新于 {formatRelative(item.updatedAt)}
          </p>
        </div>
      </div>
    </AppModal>
  );
}
