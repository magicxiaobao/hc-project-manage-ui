import { useNavigate } from "@tanstack/react-router";
import type { WorkItem } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

let browseIds: string[] = [];

export function rememberBrowse(ids: string[]) {
  browseIds = ids;
}

export function browseAround(id: string, fallback: WorkItem[]) {
  const source = browseIds.includes(id) ? browseIds : fallback.map((item) => item.id);
  const index = source.indexOf(id);
  return {
    prev: fallback.find((item) => item.id === source[index - 1]),
    next: fallback.find((item) => item.id === source[index + 1]),
  };
}

export function useGoToItem() {
  const navigate = useNavigate();
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  return (id: string) => {
    const item = items.find((entry) => entry.id === id);
    const project = projects.find((entry) => entry.id === item?.projectId);
    if (!item || !project) return;
    void navigate({ to: "/p/$projectKey/items/$itemKey", params: { projectKey: project.key, itemKey: item.key } });
  };
}
