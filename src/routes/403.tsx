import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAccessSnapshot } from "@/lib/query/hooks/useAccessSnapshot";
import { landingPath } from "@/lib/access/snapshot";
import { refreshAccess } from "@/lib/access/service";
import { useAuthStore } from "@/lib/api/auth-store";
export const Route = createFileRoute("/403")({ component: ForbiddenPage });
function ForbiddenPage() {
  const snapshot = useAccessSnapshot(),
    router = useRouter();
  const landing = landingPath(snapshot);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="type-title">无权访问此页面</h1>
      {snapshot.status === "error" ? (
        <p role="alert">权限信息加载失败，请重试</p>
      ) : (
        <p>
          {snapshot.status === "loading"
            ? "正在刷新权限…"
            : landing
              ? "当前账号没有此页面的访问权限。"
              : "暂无可访问页面"}
        </p>
      )}
      {landing && (
        <button
          type="button"
          onClick={() => void router.navigate({ href: landing, replace: true })}
        >
          返回可访问首页
        </button>
      )}
      <button
        type="button"
        disabled={snapshot.status === "loading"}
        onClick={() =>
          void refreshAccess({
            force: true,
            reason: "manual",
            queryClient: router.options.context.queryClient,
          }).catch(() => {})
        }
      >
        刷新权限
      </button>
      <button
        type="button"
        onClick={() => {
          void useAuthStore.getState().logout();
          void router.navigate({ to: "/login", replace: true });
        }}
      >
        退出登录
      </button>
    </main>
  );
}
