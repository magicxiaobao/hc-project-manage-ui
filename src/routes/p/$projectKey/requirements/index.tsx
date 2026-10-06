/**
 * 需求列表 index 路由（P1：修复 requirements.$requirementId 子路由不可达——
 * 原 requirements.tsx 的登录态列表内容移至此，原文件现为登录态布局路由）。
 */
import { createFileRoute } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { RequirementListLive } from "@/components/pm/requirement-list-live";
import { RequirementsView } from "@/components/pm/requirements-view";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/requirements/")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const { keyword } = Route.useSearch();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // Codex review 4175631821：未登录时 index 路由保留演示需求树；
  // 深链接子路由（$requirementId）走各自的登录守卫，不再被布局路由的演示分支吞掉。
  if (!isAuthenticated) return <RequirementsView projectKey={projectKey} />;
  return <LiveRequirementList projectKey={projectKey} keyword={keyword} />;
}

/**
 * P1 p1-requirement-list：路由 key（字符串）→ 后端 id（数字）→ POST /requirement/v1/findByPage。
 * 演示数据不再用于已登录的需求列表。
 */
function LiveRequirementList({ projectKey, keyword }: { projectKey: string; keyword?: string }) {
  const resolution = useProjectIdByKey(projectKey);

  if (resolution.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在解析项目…
      </div>
    );
  }
  if (resolution.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">项目解析失败：{toUserMessage(resolution.error)}</p>
        <Button variant="ghost" onPress={() => void resolution.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if (resolution.data == null) {
    return (
      <EmptyHint>{`没有找到这个项目（${projectKey}）。请检查项目标识是否正确，或确认你有该项目的访问权限。`}</EmptyHint>
    );
  }

  return <RequirementListLive projectId={resolution.data} projectKey={projectKey} keyword={keyword} />;
}
