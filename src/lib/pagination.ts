/**
 * 分页工具（纯函数，可单测）。
 */

/**
 * 越界页码纠正：total 缩水导致当前页越界时返回应回退到的最后一页；
 * 无需纠正时返回 null。调用方在得到非 null 后 setPage 并触发重新查询。
 */
export function clampPageToTotal(page: number, total: number, pageSize: number): number | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return page > totalPages ? totalPages : null;
}
