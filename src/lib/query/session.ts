/**
 * 会话与查询缓存的解耦桥（Codex review 4175265674）。
 *
 * 背景：QueryClient 在 RootComponent 里随浏览器会话常驻，但所有 query key
 * 都没有携带用户身份；登出/换账号登录时若不清缓存，账号 B 可能直接看到
 * 账号 A 的缓存数据（30s 内 stale 命中，5min 内 gc 命中）。
 *
 * auth-store 不能直接 import QueryClient 实例（实例在 __root 里创建），
 * 故此处用一个轻量注册表：__root 创建 QueryClient 后注册清理函数，
 * auth-store 在 login/logout/会话失效时调用 clearQueryCache()。
 */
type CacheClearer = () => void;

let clearer: CacheClearer | null = null;

/** __root.tsx 在创建 QueryClient 后调用一次 */
export function setQueryCacheClearer(fn: CacheClearer | null): void {
  clearer = fn;
}

/** 登录用户变更/登出时调用：取消在途查询并清空全部缓存 */
export function clearQueryCache(): void {
  clearer?.();
}
