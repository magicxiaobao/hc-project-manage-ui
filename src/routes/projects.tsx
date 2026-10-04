import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, CardBody, Chip, Spinner } from "@heroui/react";
import { useEffect, useState } from "react";
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
 *
 * Codex review 4175337074：用 PageResult.total 做分页，不再只取第一页前 100 条。
 */
const PROJECT_PAGE_SIZE = 20;

function LiveProjectList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch, isRefetching } = useProjectList({
    page,
    pageSize: PROJECT_PAGE_SIZE,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PROJECT_PAGE_SIZE));
  // Codex review 4175402475：页码越界（删除/权限变化导致当前页变空）时自动回到
  // 最后一页；空的越界页仍渲染分页器，避免用户被困在"暂无项目"无处可回。
  // Codex review 4175583399（P1）：此 effect 必须在所有 early return 之前调用——
  // 首屏 isLoading 时组件早返回，若 effect 写在早返回之后，首屏 hook 数与恢复后
  // 的 hook 数不一致，违反 hooks 顺序（Rendered more hooks than during the
  // previous render）。无条件调用，内部用 isLoading/total 门控跳过。
  useEffect(() => {
    if (!isLoading && total > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [isLoading, total, totalPages, page]);

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
  if (projects.length === 0 && total === 0) {
    return <p className="py-8 text-sm text-default-500">暂无项目</p>;
  }
  return (
    <>
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
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="type-meta">
          共 {total} 个项目 · 第 {page} / {totalPages} 页
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            isDisabled={page <= 1 || isLoading}
            onPress={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={page >= totalPages || isLoading}
            onPress={() => setPage((current) => current + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </>
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
