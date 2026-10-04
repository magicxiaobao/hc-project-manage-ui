/**
 * Codex review 4175265674 回归测试：
 * QueryClient 随浏览器会话常驻，登出/换账号登录时必须清空查询缓存，
 * 否则账号 B 会看到账号 A 的缓存数据。
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/session.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, setQueryCacheClearer } from '../session';

describe('clearQueryCache 会话缓存清理', () => {
  afterEach(() => {
    setQueryCacheClearer(null);
  });

  it('未注册时调用不抛错（SSR/纯展示场景安全）', () => {
    expect(() => clearQueryCache()).not.toThrow();
  });

  it('注册的清理函数被调用', () => {
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);
    clearQueryCache();
    expect(clearer).toHaveBeenCalledTimes(1);
  });

  it('重新注册会替换旧函数', () => {
    const first = vi.fn();
    const second = vi.fn();
    setQueryCacheClearer(first);
    setQueryCacheClearer(second);
    clearQueryCache();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('置空后不再调用', () => {
    const clearer = vi.fn();
    setQueryCacheClearer(clearer);
    setQueryCacheClearer(null);
    clearQueryCache();
    expect(clearer).not.toHaveBeenCalled();
  });
});
