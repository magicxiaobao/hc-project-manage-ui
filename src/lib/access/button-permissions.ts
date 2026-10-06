import { getAccessSnapshot, subscribeAccess } from "./store";
import { readonlySet, type AccessStatus, type ButtonDefinition } from "./snapshot";

export interface ButtonPermissionSnapshot {
  readonly userId: string | null;
  readonly sessionGeneration: number;
  readonly revision: number;
  readonly status: AccessStatus;
  readonly definitions: readonly ButtonDefinition[];
  readonly grantedCodes: ReadonlySet<string>;
}

const NO_CODES = readonlySet<string>([]);

/**
 * 交接接口（p5-dynamic-buttons 消费）：同一原子权限快照的只读投影。
 *
 * - definitions：菜单 type === 3 且 permission 非空的编码去重，保留
 *   menuIds/name/parentMenuIds 供定位；空编码、非法类型不注册。
 * - grantedCodes：定义编码与已验证 authorities 的精确交集；“定义存在”
 *   不等于“已授权”，不按冒号格式猜类型。
 * - status !== 'ready' 时 grantedCodes 强制为空：调用方绝不能拿着
 *   loading/error/清理中的旧授权做按钮决策。
 * - 登出、换账号、确认失效时 store 发布空快照并递增 sessionGeneration，
 *   订阅者会收到清理事件。
 */
let source: ReturnType<typeof getAccessSnapshot> | null = null;
let projection: ButtonPermissionSnapshot;
export function getButtonPermissionSnapshot(): ButtonPermissionSnapshot {
  const snapshot = getAccessSnapshot();
  if (snapshot !== source) {
    source = snapshot;
    projection = Object.freeze({
      userId: snapshot.userId,
      sessionGeneration: snapshot.sessionGeneration,
      revision: snapshot.revision,
      status: snapshot.status,
      definitions: snapshot.definitions,
      grantedCodes: snapshot.status === "ready" ? snapshot.grantedCodes : NO_CODES,
    });
  }
  return projection;
}

/** 订阅权限快照发布（含清理事件）；返回取消订阅函数。 */
export function subscribeButtonPermissions(listener: () => void): () => void {
  return subscribeAccess(listener);
}
