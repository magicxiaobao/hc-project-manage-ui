import { useRouter } from "@tanstack/react-router";
import { useAccessSnapshot } from "@/lib/query/hooks/useAccessSnapshot";
import { refreshAccess } from "@/lib/access/service";
import { useAuthStore } from "@/lib/api/auth-store";
export function AccessState() {
  const snapshot = useAccessSnapshot();
  const router = useRouter();
  return (
    <section
      className="flex min-h-40 flex-col items-center justify-center gap-3 p-6"
      aria-live="polite"
    >
      <p>{snapshot.status === "error" ? "权限信息加载失败" : "正在加载权限信息…"}</p>
      {snapshot.status === "error" && (
        <button
          type="button"
          onClick={() =>
            void refreshAccess({
              force: true,
              reason: "retry",
              queryClient: router.options.context.queryClient,
            })
              .then(() => router.invalidate())
              .catch(() => {})
          }
        >
          重试加载权限
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          void useAuthStore.getState().logout();
          void router.navigate({ to: "/login", replace: true, ignoreBlocker: true });
        }}
      >
        退出登录
      </button>
    </section>
  );
}
