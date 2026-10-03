import { createFileRoute } from "@tanstack/react-router";
import { EmptyHint } from "@/components/biz";
import { RequirementDetailLive } from "@/components/pm/requirement-detail-live";
import { useAuthStore } from "@/lib/api/auth-store";

export const Route = createFileRoute("/p/$projectKey/requirements/$requirementId")({
  component: Page,
});

function Page() {
  const { projectKey, requirementId } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 未登录：演示侧没有需求详情页，直接提示登录。
  if (!isAuthenticated) {
    return <EmptyHint>{"登录后查看需求详情。"}</EmptyHint>;
  }

  const id = /^\d+$/.test(requirementId) ? Number(requirementId) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    return <EmptyHint>{`需求 ID 不合法（${requirementId}）。`}</EmptyHint>;
  }

  return <RequirementDetailLive requirementId={id} projectKey={projectKey} />;
}
