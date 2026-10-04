/**
 * storage 事件 hydrate 过滤（本地评审 pi P2）：
 * 只响应身份键 USER_INFO_STORAGE_KEY（persistLogin 总是最后写它）与
 * key === null（clear() 整库清空 = 登出）；token/refreshToken 单键事件
 * 不触发 hydrate，避免在部分写入中间态把残缺会话判为僵尸并清掉他人凭证。
 */
import { describe, expect, it } from 'vitest';
import { shouldHydrateOnStorageEvent } from '../auth-store';
import {
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_INFO_STORAGE_KEY,
} from '../client';

describe('shouldHydrateOnStorageEvent', () => {
  it('key === null（clear()，即登出）时触发', () => {
    expect(shouldHydrateOnStorageEvent(null)).toBe(true);
  });

  it('userInfo 键（persistLogin 最后写入）时触发', () => {
    expect(shouldHydrateOnStorageEvent(USER_INFO_STORAGE_KEY)).toBe(true);
  });

  it('token 单键事件不触发（部分写入中间态保护）', () => {
    expect(shouldHydrateOnStorageEvent(TOKEN_STORAGE_KEY)).toBe(false);
  });

  it('refreshToken 单键事件不触发（部分写入中间态保护）', () => {
    expect(shouldHydrateOnStorageEvent(REFRESH_TOKEN_STORAGE_KEY)).toBe(false);
  });

  it('无关键不触发', () => {
    expect(shouldHydrateOnStorageEvent('theme')).toBe(false);
  });
});
