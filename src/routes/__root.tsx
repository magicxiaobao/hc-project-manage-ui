import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@heroui/react";
import { AuthProvider } from "@/lib/auth/provider";
import { useAuthStore } from "@/lib/api/auth-store";
import { createQueryClient } from "@/lib/query/client";
import { setQueryCacheClearer } from "@/lib/query/session";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "恒川 · 项目协作" },
      { name: "theme-color", content: "#0747a6" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootComponent,
});

/**
 * 根组件：挂载时从 localStorage 恢复登录态（hydrate 幂等），
 * 使 / /inbox /me /p/* 等路由直刷/深链也能拿到登录态，
 * 而不依赖 /login 或 /projects 的各自调用。
 *
 * QueryClient 用 useState 惰性创建：SSR 与纯 SPA 下都保证每实例一份，
 * 不会跨请求共享缓存。
 */
function RootComponent() {
  const [queryClient] = useState(() => createQueryClient());
  useEffect(() => {
    useAuthStore.getState().hydrate();
    // 登录用户变更时清空查询缓存：防止账号 B 读到账号 A 的缓存数据。
    setQueryCacheClearer(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
    });
    return () => setQueryCacheClearer(null);
  }, [queryClient]);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <I18nProvider locale="zh-CN">
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <Outlet />
            </AuthProvider>
          </QueryClientProvider>
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}
