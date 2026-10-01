import { useNavigate } from "@tanstack/react-router";
import { usePm } from "@/lib/pm/store";

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
