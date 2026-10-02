import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { EmptyHint, IssueDialog } from "@/components/biz";
import { usePm } from "@/lib/pm/store";
import { readItemOrigin, returnHistoryDelta } from "@/lib/pm/navigation";

export function IssuePage({ projectKey, itemKey }: { projectKey: string; itemKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const item = usePm((state) =>
    state.items.find((entry) => entry.projectId === project?.id && entry.key === itemKey),
  );
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const versions = usePm((state) => state.versions);
  const items = usePm((state) => state.items);
  const commentsAll = usePm((state) => state.comments);
  const feedsAll = usePm((state) => state.feeds);
  const historiesAll = usePm((state) => state.histories);
  const comments = useMemo(
    () => commentsAll.filter((entry) => entry.itemId === item?.id),
    [commentsAll, item?.id],
  );
  const feeds = useMemo(
    () => feedsAll.filter((entry) => entry.itemId === item?.id),
    [feedsAll, item?.id],
  );
  const histories = useMemo(
    () => historiesAll.filter((entry) => entry.itemId === item?.id),
    [historiesAll, item?.id],
  );
  const navigate = useNavigate();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const closingEntry = useRef<string | undefined>(undefined);

  if (!project || !item) return <EmptyHint>没有找到这个事项。</EmptyHint>;

  const parent = items.find((entry) => entry.id === item.parentId);
  const children = items.filter((entry) => entry.parentId === item.id);

  return (
    <IssueDialog
      key={item.id}
      projectKey={projectKey}
      item={item}
      people={people}
      sprints={sprints.filter((entry) => entry.projectId === item.projectId)}
      versions={versions.filter((entry) => entry.projectId === item.projectId)}
      parent={parent}
      children={children}
      comments={comments}
      feeds={feeds}
      histories={histories}
      onClose={() => {
        const entry = location.state.__TSR_key;
        if (closingEntry.current === entry || router.state.location.state.__TSR_key !== entry)
          return;
        closingEntry.current = entry;
        const origin = readItemOrigin(location.state.pmItemOrigin);
        const delta = returnHistoryDelta(origin, location.state.__TSR_index);
        if (delta !== undefined) router.history.go(delta);
        else void navigate({ href: origin?.href ?? `/p/${projectKey}`, replace: true });
      }}
      onPatch={(patch) => {
        const result = usePm.getState().updateItem(item.id, patch);
        if (!result.ok) toast.error(result.message);
      }}
      onTransition={(to, reason) => usePm.getState().transition(item.id, to, reason)}
      onComment={(body) => usePm.getState().addComment(item.id, body)}
    />
  );
}
