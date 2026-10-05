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

/**
 * 是否应钳制页码（纯函数，可单测）：
 * - 重取中（isSuccess=true 但 isFetching=true）时必须返回 null——此时读到的是
 *   失效缓存的旧 total，按它钳制会把用户提前拉回上一页；
 * - 只有当前页请求完成后（isFetching=false）才按新 total 判断。
 */
export function shouldClampPage(
  isSuccess: boolean,
  isFetching: boolean,
  page: number,
  total: number,
  pageSize: number,
): number | null {
  if (!isSuccess || isFetching) return null;
  return clampPageToTotal(page, total, pageSize);
}
