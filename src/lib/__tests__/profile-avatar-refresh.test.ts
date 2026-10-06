/**
 * p5-user-profile 回归测试（run207-codex-P5-r22-1）：
 * 头像上传成功后必须先 cancelQueries（丢弃在途的旧头像 GET），
 * 再 invalidateQueries，否则旧响应晚到会覆盖缓存、页面继续显示旧头像。
 *
 * 运行：pnpm vitest run src/lib/__tests__/profile-avatar-refresh.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { avatarQueryKey, refreshAvatarAfterUpload } from '../user-profile';

const USER_ID = 42;
const AVATAR_KEY = avatarQueryKey(USER_ID);

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('refreshAvatarAfterUpload', () => {
  it('先取消在途查询，再失效（顺序一致、key 一致）', async () => {
    const qc = makeClient();
    const order: string[] = [];
    const cancel = vi.spyOn(qc, 'cancelQueries').mockImplementation(async () => {
      order.push('cancel');
    });
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockImplementation(async () => {
      order.push('invalidate');
    });
    try {
      await refreshAvatarAfterUpload(qc, USER_ID);
      expect(order).toEqual(['cancel', 'invalidate']);
      expect(cancel).toHaveBeenCalledWith({ queryKey: AVATAR_KEY });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: AVATAR_KEY });
    } finally {
      cancel.mockRestore();
      invalidate.mockRestore();
    }
  });

  it('首次 GET 在途时上传成功：旧响应晚到不写入缓存，失效后可取到新头像', async () => {
    const qc = makeClient();
    let resolveOld!: (blob: Blob) => void;
    const oldGate = new Promise<Blob>((res) => {
      resolveOld = res;
    });
    // 首次头像 GET：发起但不返回（在途）
    const inFlight = qc.fetchQuery({ queryKey: AVATAR_KEY, queryFn: () => oldGate });
    inFlight.catch(() => {
      /* 取消后 reject，测试里吞掉 */
    });
    await vi.waitFor(() => {
      expect(qc.getQueryState(AVATAR_KEY)?.fetchStatus).toBe('fetching');
    });

    // 上传成功 → 取消在途旧 GET + 失效
    await refreshAvatarAfterUpload(qc, USER_ID);

    // 旧请求此时才返回（晚到）：其响应必须被丢弃，不能写入缓存
    resolveOld(new Blob(['old-avatar'], { type: 'image/png' }));
    await inFlight.catch(() => {});
    expect(qc.getQueryData(AVATAR_KEY)).toBeUndefined();

    // 失效后发起上传后的新 GET，能拿到新头像
    const fresh = new Blob(['new-avatar'], { type: 'image/png' });
    const data = await qc.fetchQuery({
      queryKey: AVATAR_KEY,
      queryFn: () => Promise.resolve(fresh),
    });
    expect(data).toBe(fresh);
  });
});
