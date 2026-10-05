/**
 * 甘特图路由（P3：p3-gantt）。
 *
 * 登录态：projectKey → projectId（useProjectIdByKey）→ GanttLive
 * （GET /task/v1/gantt/{projectId} 时间条 + 拖拽改期 + 依赖连线 +
 * 后端关键路径 + 里程碑叠加）。
 * 未登录：保留演示甘特视图（GanttView），供未登录浏览。
 */
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { GanttLive } from "@/components/pm/gantt-live";
import { GanttView } from "@/components/pm/gantt-view";
import { useAuthStore } from "@/lib/api/auth-store";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

export const Route = createFileRoute("/p/$projectKey/gantt")({
  component: Page,
});

function Page() {
  const { projectKey } = Route.useParams();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <GanttView projectKey={projectKey} />;
  return <LiveGantt projectKey={projectKey} />;
}

/**
 * P3 p3-gantt：路由 key（字符串）→ 后端 id（数字）→ 甘特图实时视图。
 * 演示数据不再用于已登录的甘特页。
 */
function LiveGantt({ projectKey }: { projectKey: string }) {
  const resolution = useProjectIdByKey(projectKey);
  // 上次解析成功的项目 id：后台重取失败（isError）时保留已挂载的
  // 图表与其弹窗子树，脏表单不被卸载（沿用 backlog 路由的 P3 经验）。
  // ref 按 projectKey 归属：切换项目后旧 key 的 lastGood 不再复用。
  const lastGood = useRef<{ key: string; id: number } | null>(null);
  if (typeof resolution.data === "number") {
    lastGood.current = { key: projectKey, id: resolution.data };
  }
  const projectId =
    typeof resolution.data === "number"
      ? resolution.data
      : lastGood.current?.key === projectKey
        ? lastGood.current.id
        : null;

  // 解析成功但返回 null = 项目不存在：必须显式展示错误态，
  // 不能回退到旧项目的甘特图（否则页面显示的不是当前 key 的项目）
  if (!resolution.isPending && !resolution.isError && resolution.data == null) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">
          {`项目不存在（${projectKey}）。请检查项目标识是否正确，或确认你有该项目的访问权限。`}
        </p>
        <Button
          variant="ghost"
          onPress={() => window.history.back()}
        >
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
  if (projectId == null) {
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

  // 后台重取失败时保留图表挂载：顶部展示错误横幅 + 重试，不卸载脏表单。
  return (
    <>
      {resolution.isError ? (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2">
          <p className="type-body flex-1 text-danger">
            项目解析失败（后台刷新）：{toUserMessage(resolution.error)}。图表为上次成功的数据。
          </p>
          <Button size="sm" variant="ghost" onPress={() => void resolution.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      <GanttLive projectId={projectId} projectKey={projectKey} />
    </>
  );
}
