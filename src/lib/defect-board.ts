/**
 * 缺陷看板纯函数（P2：p2-defect-board）。
 *
 * 与组件分离以便单元测试：dnd id 编解码与拖放落点解析不依赖 DOM。
 */
import type { DefectStatus } from "./api/defect-types";

/** dnd id 前缀：卡片 `card:<id>`、列 `column:<DefectStatus>`（互不碰撞） */
export const cardDndId = (id: number) => `card:${id}`;
export const columnDndId = (status: string) => `column:${status}`;

/**
 * 解析拖放落点：
 * - `column:<status>` → 该列状态
 * - `card:<id>` → 该卡片当前状态
 * - 其他 → null（无合法落点）
 */
export function resolveBoardDropTarget(
  overId: string,
  statusOfCard: (cardId: number) => DefectStatus | undefined,
): DefectStatus | null {
  if (overId.startsWith("column:")) {
    return overId.slice("column:".length) as DefectStatus;
  }
  if (overId.startsWith("card:")) {
    const status = statusOfCard(Number(overId.slice("card:".length)));
    return status ?? null;
  }
  return null;
}
