/**
 * 路由项目归属闸门（Codex review 4183398133 / 4183398138）。
 *
 * 看板/冲刺详情只按自身 id 取数，/p/A/boards/<B 的看板> 这类链接会在项目 A
 * 的上下文里展示并允许操作 B 的数据。与任务/需求/缺陷详情页同一口径：路由
 * projectKey 解析出的 id 与记录 projectId 明确不一致时提示检查链接。
 *
 * 子树（含全部写操作）在首次确认归属一致后才挂载；确认过一次后，后台重取
 * 失败/重新 pending 不再卸载子树——交给子树自己的刷新横幅，脏表单不丢。
 */
import { useRef, type ReactNode } from "react";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint } from "@/components/biz";
import { toUserMessage, useProjectIdByKey } from "@/lib/query";

interface OwnerQuery {
  data: { projectId: number } | undefined;
  error: unknown;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => unknown;
}

export function ProjectOwnershipGate({
  projectKey,
  objectLabel,
  owner,
  children,
}: {
  projectKey: string;
  /** 提示文案中的对象名，如"看板 #12" */
  objectLabel: string;
  owner: OwnerQuery;
  children: ReactNode;
}) {
  const routeProject = useProjectIdByKey(projectKey);
  const verified = useRef(false);
  const routeProjectId = routeProject.data;
  const ownerProjectId = owner.data?.projectId;

  if (typeof routeProjectId === "number" && typeof ownerProjectId === "number") {
    if (ownerProjectId !== routeProjectId) {
      return (
        <EmptyHint>{`${objectLabel} 不属于当前项目（/p/${projectKey}），请检查链接。`}</EmptyHint>
      );
    }
    verified.current = true;
  }
  if (verified.current) return <>{children}</>;

  if (routeProject.isError || owner.isError) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">
          加载失败：{toUserMessage(routeProject.isError ? routeProject.error : owner.error)}
        </p>
        <Button
          variant="ghost"
          onPress={() => {
            if (routeProject.isError) void routeProject.refetch();
            if (owner.isError) void owner.refetch();
          }}
        >
          重试
        </Button>
      </div>
    );
  }
  if (routeProject.isSuccess && routeProjectId == null) {
    return (
      <EmptyHint>{`没有找到这个项目（${projectKey}）。请检查项目标识是否正确，或确认你有该项目的访问权限。`}</EmptyHint>
    );
  }
  // 记录本身为空（后端未返回）：无归属可比，交给子树自己的空态处理
  if (owner.isSuccess && ownerProjectId == null) return <>{children}</>;

  return (
    <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
      <Spinner size="sm" /> 正在确认项目归属…
    </div>
  );
}
