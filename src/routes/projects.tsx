import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { PageHeading, ProjectCard } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

export const Route = createFileRoute("/projects")({ component: ProjectsPage });

function ProjectsPage() {
  return (
    <AppShell>
      <ProjectsBody />
    </AppShell>
  );
}

function ProjectsBody() {
  const navigate = useNavigate();
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="项目" hint="进入项目后使用看板、待办、事项和版本。这是前端样板，数据留在浏览器里。" />
        <Button variant="primary" onPress={() => void navigate({ to: "/projects/new" })}>
          新建项目
        </Button>
      </div>
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
    </div>
  );
}
