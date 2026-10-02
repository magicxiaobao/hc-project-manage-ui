export type StorageResult<T> = { ok: true; value: T } | { ok: false; message: string };
type LocalStorage = Pick<Storage, "getItem" | "setItem">;

export function readStoredJson<T>(getStorage: () => LocalStorage, key: string, decode: (value: unknown) => T): StorageResult<T | null> {
  try {
    const raw = getStorage().getItem(key);
    return { ok: true, value: raw === null ? null : decode(JSON.parse(raw)) };
  } catch {
    // 不删除或覆盖无法理解的数据；允许用户恢复权限后重试。
    return { ok: false, message: "无法读取本机数据。原数据未被删除或覆盖，请检查浏览器存储权限后重试。" };
  }
}

export function writeStoredJson(getStorage: () => LocalStorage, key: string, value: unknown): StorageResult<null> {
  try {
    getStorage().setItem(key, JSON.stringify(value));
    return { ok: true, value: null };
  } catch {
    return { ok: false, message: "无法保存到本机。改动仅保留在当前页面，刷新或关闭页面会丢失；请恢复存储空间或权限后重试保存。" };
  }
}

export function changeFeedback(message: string, persistenceError: string | null): string {
  return persistenceError ? "本次改动仅保留在当前页面，尚未保存到本机。请使用页面提示重试保存。" : message;
}
