import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, CardBody, Chip, Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
import { PageHeading, ProjectCard } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { columnOf } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";
import { ApiBusinessError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/api/auth-store";
import { projectApi } from "@/lib/api/project";
import type { ProjectResponse } from "@/lib/api/types";

export const Route = createFileRoute("/projects")({ component: ProjectsPage });

function ProjectsPage() {
  return (
    <AppShell>
      <ProjectsBody />
    </AppShell>
  );
}

/**
 * Phase 0 垂直切片：已登录时走真实后端 /project/v1/findByPage 渲染项目列表。
 */
function LiveProjectList() {
  const [projects, setProjects] = useState<ProjectResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    projectApi
      .getProjectList({ page: 1, pageSize: 100 })
      .then((page) => {
        if (!cancelled) setProjects(page.list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiBusinessError ? err.message : "加载项目列表失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-danger">加载失败：{error}</p>;
  }
  if (!projects) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在从后端加载项目…
      </div>
    );
  }
  if (projects.length === 0) {
    return <p className="py-8 text-sm text-default-500">暂无项目</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {projects.map((p) => (
        <Card key={p.id} className="w-full">
          <CardBody className="flex flex-col items-start gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <Chip size="sm" color="primary" variant="flat">
                {p.projectKey}
              </Chip>
              <span className="type-section">{p.projectName}</span>
            </span>
            {p.description ? <span className="type-meta">{p.description}</span> : null}
            <span className="type-meta">
              状态 {p.status} · 负责人 {p.projectManagerName ?? "未指定"} · 成员 {p.memberCount ?? 0} 人
            </span>
            {/* Phase 0：后端项目暂不提供“进入项目”跳转——目标路由（/p/$projectKey）只从本地
                usePm 种子数据解析项目，跳转会导致“没有找到这个项目”或误操作 demo 数据。
                待后端项目路由接入后再恢复。 */}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function ProjectsBody() {
  const navigate = useNavigate();
  const { isAuthenticated, hydrate, logout } = useAuthStore();
  const projects = usePm((state) => state.projects);
  const items = usePm((state) => state.items);
  const people = usePm((state) => state.people);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          title="项目"
          hint={
            isAuthenticated
              ? "已连接后端，展示真实项目数据。"
              : "进入项目后使用看板、待办、事项和版本。这是前端样板，数据留在浏览器里。登录后可连接真实后端。"
          }
        />
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button variant="flat" onPress={() => void logout()}>
              登出
            </Button>
          ) : (
            <Button color="primary" variant="flat" onPress={() => void navigate({ to: "/login" })}>
              登录后端
            </Button>
          )}
          <Button variant="primary" onPress={() => void navigate({ to: "/projects/new" })}>
            新建项目
          </Button>
        </div>
      </div>
      {isAuthenticated ? (
        <LiveProjectList />
      ) : (
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
      )}
    </div>
  );
}
