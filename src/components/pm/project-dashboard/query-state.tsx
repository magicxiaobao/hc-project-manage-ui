import { Button } from "@heroui/react";
import { toUserMessage } from "@/lib/query/error";
import { isDashboardPermissionDenied } from "@/lib/project-dashboard-data";

export function ProjectStatsError({
  error,
  retry,
  hasData = false,
  area,
}: {
  error: unknown;
  retry: () => void;
  hasData?: boolean;
  area: string;
}) {
  const denied = isDashboardPermissionDenied(error);
  return (
    <div role="alert" className="space-y-2 text-danger">
      <p>
        {area}：
        {denied ? "无权限，区域受限。" : hasData ? "刷新失败，显示上次成功数据。" : "读取失败。"}
        {toUserMessage(error)}
      </p>
      <Button variant="ghost" size="sm" onPress={retry}>
        重试{area}
      </Button>
    </div>
  );
}
