import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@heroui/react";
import { AuthProvider } from "@/lib/auth/provider";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
} from "@/lib/api/client";
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
  // Codex 本地评审 P1（4175724983 跟进）：跨 tab 换账号（A→B）时只清查询
  // 缓存是不够的——已挂载且仅订阅 isAuthenticated 的页面不会重渲染，其
  // QueryObserver 在 queryClient.clear() 后仍持有被移除的 query 实例，
  // 继续展示 A 的旧数据（已用 QueryObserver 实证：clear 后 status 仍为
  // success、fetch 次数不变），而写操作已用 B 的 token。
  // 以账号身份为 key 重挂载整个路由子树：身份变化后所有页面都是全新实例，
  // 全部查询按新身份重新拉取。token 刷新等 userId 不变的场景 key 不变，
  // 不会重挂载。
  const accountKey = useAuthStore((state) => state.user?.userId ?? "anonymous");
  useEffect(() => {
    useAuthStore.getState().hydrate();
    // 登录用户变更时清空查询缓存：防止账号 B 读到账号 A 的缓存数据。
    setQueryCacheClearer(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
    });
    // Codex review 4175724983：hydrate 只在挂载时跑一次——另一 tab 把持久
    // 会话换成另一个账号（或登出）时，已挂载的 /p/* 路由感知不到：store 与
    // 查询缓存仍停留在旧账号，而 API 客户端已开始读新账号的 token，页面会
    // 展示旧账号的缓存数据并以新账号身份提交写操作。storage 事件只在其它
    // tab 变更存储时触发，相关键变化时重新 hydrate（账号变化/跨 tab 登出
    // 的清理逻辑复用 hydrate 内部已有的分支）。
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === TOKEN_STORAGE_KEY ||
        event.key === REFRESH_TOKEN_STORAGE_KEY ||
        event.key === USER_INFO_STORAGE_KEY
      ) {
        useAuthStore.getState().hydrate();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      setQueryCacheClearer(null);
      window.removeEventListener("storage", onStorage);
    };
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
              <Outlet key={accountKey} />
            </AuthProvider>
          </QueryClientProvider>
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}
