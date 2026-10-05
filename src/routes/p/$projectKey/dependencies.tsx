import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { TaskDependenciesLive } from "@/components/pm/task-dependencies-live";
import { DependenciesView } from "@/components/pm/dependencies-view";
import { isPositiveSafeId } from "@/lib/task-dependencies-live";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey, nextLastGoodProject } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/dependencies")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <DependenciesView projectKey={projectKey} />;
  return <LiveDependencies projectKey={projectKey} />;
}

function LiveDependencies({ projectKey }: { projectKey: string }) {
  const resolution = useProjectIdByKey(projectKey);
  // 上次解析成功的项目 id：后台重取失败（isError）时保留已挂载的
  // 列表与其弹窗子树，脏表单不被卸载（沿用 backlog 路由的 P3 经验）。
  // ref 按 projectKey 归属：切换项目后旧 key 的 lastGood 不再复用。
  // r25-2：解析成功但返回 null（项目不存在）是权威结论，必须清除该 key
  // 的 lastGood——否则之后重取失败会回退到旧项目 id，显示错项目。
  const lastGood = useRef<{ key: string; id: number } | null>(null);
  lastGood.current = nextLastGoodProject(lastGood.current, projectKey, resolution);
  const projectId =
    typeof resolution.data === "number"
      ? resolution.data
      : lastGood.current?.key === projectKey
        ? lastGood.current.id
        : null;

  // 解析成功但返回 null = 项目不存在：必须显式展示错误态，
  // 不能回退到旧项目的依赖列表（否则页面显示的不是当前 key 的项目）
  if (!resolution.isPending && !resolution.isError && resolution.data == null) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">
          {`项目不存在（${projectKey}）。请检查项目标识是否正确，或确认你有该项目的访问权限。`}
        </p>
        <Button variant="ghost" onPress={() => window.history.back()}>
          返回上一页
        </Button>
      </div>
    );
  }

  if (resolution.isPending && projectId == null) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" /> 正在解析项目…
      </div>
    );
  }
  if (!isPositiveSafeId(projectId)) {
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
    return (
      <EmptyHint>{`没有找到这个项目（${projectKey}）。请检查项目标识是否正确，或确认你有该项目的访问权限。`}</EmptyHint>
    );
  }

  // 后台重取失败时保留列表挂载：顶部展示错误横幅 + 重试，不卸载脏表单。
  return (
    <>
      {resolution.isError ? (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2">
          <p className="type-body flex-1 text-danger">
            项目解析失败（后台刷新）：{toUserMessage(resolution.error)}。列表为上次成功的数据。
          </p>
          <Button size="sm" variant="ghost" onPress={() => void resolution.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      <TaskDependenciesLive
        key={`${projectKey}:${projectId}`}
        projectId={projectId}
        projectKey={projectKey}
      />
    </>
  );
}
