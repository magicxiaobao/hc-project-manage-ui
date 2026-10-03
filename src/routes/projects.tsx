import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, CardBody, Chip, Spinner } from "@heroui/react";
import { useEffect } from "react";
import { PageHeading } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { DemoProjectList } from "@/components/pm/demo-project-list";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectList } from "@/lib/query";

export const Route = createFileRoute("/projects")({ component: ProjectsPage });

function ProjectsPage() {
  return (
    <AppShell>
      <ProjectsBody />
    </AppShell>
  );
}

/**
 * P1 p1-store-migration：已登录时走 react-query useProjectList
 *（POST /project/v1/findByPage），不再直调 projectApi、不再引用 usePm 演示 store。
 */
function LiveProjectList() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, isRefetching } = useProjectList({
    page: 1,
    pageSize: 100,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在从后端加载项目…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center gap-3 py-8 text-sm text-danger">
        <span>加载失败：{toUserMessage(error, "加载项目列表失败")}</span>
        <Button
          size="sm"
          variant="ghost"
          isDisabled={isRefetching}
          onPress={() => {
            void refetch();
          }}
        >
          重试
        </Button>
      </div>
    );
  }
  const projects = data?.list ?? [];
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
            {/* P1 p1-project-detail-live：后端项目可进入 /p/$projectKey，路由内解析 projectKey → id 后走 findById。 */}
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                void navigate({ to: "/p/$projectKey", params: { projectKey: p.projectKey } });
              }}
            >
              进入项目
            </Button>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function ProjectsBody() {
  const navigate = useNavigate();
  const { isAuthenticated, hydrate, logout } = useAuthStore();

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
      {/* P1 p1-store-migration：登录态走 react-query，演示分支已抽为 DemoProjectList；本路由不再引用 usePm。 */}
      {isAuthenticated ? <LiveProjectList /> : <DemoProjectList />}
    </div>
  );
}
