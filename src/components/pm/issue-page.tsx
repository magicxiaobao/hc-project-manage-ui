import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { EmptyHint, IssueDialog } from "@/components/biz";
import { usePm } from "@/lib/pm/store";

export function IssuePage({ projectKey, itemKey }: { projectKey: string; itemKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const item = usePm((state) => state.items.find((entry) => entry.projectId === project?.id && entry.key === itemKey));
  const people = usePm((state) => state.people);
  const sprints = usePm((state) => state.sprints);
  const versions = usePm((state) => state.versions);
  const items = usePm((state) => state.items);
  const commentsAll = usePm((state) => state.comments);
  const feedsAll = usePm((state) => state.feeds);
  const historiesAll = usePm((state) => state.histories);
  const comments = useMemo(() => commentsAll.filter((entry) => entry.itemId === item?.id), [commentsAll, item?.id]);
  const feeds = useMemo(() => feedsAll.filter((entry) => entry.itemId === item?.id), [feedsAll, item?.id]);
  const histories = useMemo(() => historiesAll.filter((entry) => entry.itemId === item?.id), [historiesAll, item?.id]);
  const navigate = useNavigate();

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
        void navigate({ to: "/p/$projectKey", params: { projectKey } });
      }}
      onPatch={(patch) => usePm.getState().updateItem(item.id, patch)}
      onTransition={(to, reason) => usePm.getState().transition(item.id, to, reason)}
      onComment={(body) => usePm.getState().addComment(item.id, body)}
    />
  );
}
