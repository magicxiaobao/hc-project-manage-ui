/**
 * 未登录演示：项目列表走 usePm 种子数据。
 *
 * P1 p1-store-migration：登录态项目列表已迁移为 react-query（LiveProjectList，
 * 见 src/routes/projects.tsx），不再引用本 store。本组件是唯一仍使用
 * projects/items/people 选择器的项目域组件，仅供未登录演示路径使用。
 */
import { useNavigate } from "@tanstack/react-router";
import { ProjectCard } from "@/components/biz";
import { columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

export function DemoProjectList() {
  const navigate = useNavigate();
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {projects.map((project) => {
        const owned = items.filter((item) => item.projectId === project.id);
        const open = owned.filter((item) => {
          const column = columnOf(item.kind, item.status);
          return column !== "done" && column !== "cancelled";
        }).length;
        return (
          <ProjectCard
            key={project.id}
            project={project}
            lead={people.find((person) => person.id === project.leadId)}
            openCount={open}
            total={owned.length}
            onOpen={() => {
              void navigate({ to: "/p/$projectKey", params: { projectKey: project.key } });
            }}
          />
        );
      })}
    </div>
  );
}
