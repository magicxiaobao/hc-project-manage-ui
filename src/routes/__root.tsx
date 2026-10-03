import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { I18nProvider } from "@heroui/react";
import { AuthProvider } from "@/lib/auth/provider";
import { useAuthStore } from "@/lib/api/auth-store";
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
 */
function RootComponent() {
  useEffect(() => {
    useAuthStore.getState().hydrate();
  }, []);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <I18nProvider locale="zh-CN">
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}
