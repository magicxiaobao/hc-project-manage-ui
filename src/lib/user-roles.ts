/**
 * 用户分配角色（P5 p5-user-roles）的纯逻辑 helper：选择集的归一化、比较与
 * 角色展示名。UI 无关，便于单元测试。
 *
 * 后端契约（已与 hc-project-manage 主干核对）：
 * - GET /role/v1/list?keyword= 设计上希望只返回 enabled=true 的角色
 *   （keyword 对 roleName/roleCode LIKE），但后端实现并非如此：
 *   ⚠ RoleController 的 wrapper.like(name).or().like(code).eq(enabled,true)
 *   缺括号，按 SQL 优先级展开为 name LIKE ? OR (code LIKE ? AND enabled=true)——
 *   名称命中的禁用角色会漏进搜索结果。因此搜索结果不是无条件可靠的启用
 *   证据：提取时先按 role.enabled === true 过滤（r20-1，extractEnabledRoleIds），
 *   再经 mergeLiveEnabledIds 时效合并（比全量缓存更新）才并入。
 * - GET /user/v1/roles/{userId} 返回用户当前全部已分配角色（含已禁用的）；
 * - POST /user/v1/assignRoles { userId, roleIds } 是全量替换。
 *
 * 因此保存时必须保留"当前已分配但候选列表里没有"（已禁用）的 roleId，
 * 否则一次保存会把它们静默清掉。
 *
 * 关键约定（r15 修复后）：凡是写"候选列表"的地方，一律指 keyword 为空时的
 * 全量启用候选——搜索过滤后的子集绝不能传入 buildAssignRoleIds /
 * staleAssignedRoles，否则未命中关键词的已启用角色会被误判为"残留/禁用"。
 *
 * r16 补充约定：
 * - 弹窗每轮打开锁定一份全量候选快照（首个同时就绪的 fullOptions.data）：
 *   dirty 基线、保存基线、"已禁用"提示全部以该快照为准，后台刷新不再漂移
 *   基线——基线范围变更不应自行产生删除意图；
 * - 快照未锁定（播种未完成）或保存在途时，勾选一律不可编辑。
 *
 * r17 补充约定（run194-codex-pi-P5-r17-1）：
 * - 快照锁定后会话期间重新启用的角色：staleAssignedRoles 不再把它标为
 *   "已禁用"（文案必须与事实一致）；这类"快照外保留角色"改由
 *   retainedOutsideSnapshotRoles 识别，展示层只读标注、不可勾选——保存时
 *   buildAssignRoleIds 会自动保留它们，UI 诚实说明而不是假装可取消。
 */
import type { RoleResponse } from './api/system-types';

/** 角色展示名：roleName > roleCode > #id */
export function roleDisplayName(role: RoleResponse): string {
  if (role.roleName && role.roleName.trim()) return role.roleName;
  if (role.roleCode && role.roleCode.trim()) return role.roleCode;
  return `#${role.id}`;
}

/** 提取 id 并排序（稳定比较用） */
export function sortedIds(ids: readonly number[]): number[] {
  return [...ids].sort((a, b) => a - b);
}

/** 两个 id 集合是否相等（顺序无关） */
export function sameIdSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = sortedIds(a);
  const sb = sortedIds(b);
  return sa.every((id, index) => id === sb[index]);
}

/** 从角色列表提取 id 集合 */
export function extractRoleIds(roles: readonly RoleResponse[]): number[] {
  return roles.map((role) => role.id);
}

/**
 * r20-1：搜索正向启用证据的提取——只保留 role.enabled === true 的角色。
 *
 * 后端 RoleController 的 wrapper.like(name).or().like(code).eq(enabled,true)
 * 缺括号（SQL 展开为 name LIKE ? OR (code LIKE ? AND enabled=true)），名称
 * 命中的禁用角色会漏进搜索结果（BaseRoleVO 复制的是真实 enabled，因此
 * role.enabled 可信）。mergeLiveEnabledIds 的时效判据单独不足以挡住这种
 * 漏入：弹窗打开时全量先落数据（fullUpdatedAt=t0），随后的每次常规搜索
 * 都必然 searchUpdatedAt > t0、判据恒放行。于是证据提取时先按 enabled
 * 过滤，时效判据保留作为第二道防线。
 */
export function extractEnabledRoleIds(roles: readonly RoleResponse[]): number[] {
  return roles.filter((role) => role.enabled === true).map((role) => role.id);
}

/** 候选渲染输入：禁用角色仅在保存自动保留集合内时只读展示。 */
export function filterRoleCandidates(
  roles: readonly RoleResponse[],
  retainedIds: ReadonlySet<number>,
): RoleResponse[] {
  return roles.filter((role) => role.enabled === true || retainedIds.has(role.id));
}

/** 剔除编辑期间消失的新选角色；初始已分配角色仍按锁定基线处理。 */
export function filterMissingNewRoleIds(
  selected: readonly number[],
  initial: readonly number[],
  candidateIds: readonly number[],
): number[] {
  const available = new Set([...initial, ...candidateIds]);
  return selected.filter((id) => available.has(id));
}

/** 全量替换前必须确认分配查询仍是播种时的版本。 */
export function isAssignmentBaselineCurrent(
  seededUpdatedAt: number | null,
  currentUpdatedAt: number,
): boolean {
  return seededUpdatedAt !== null && seededUpdatedAt === currentUpdatedAt;
}

/**
 * 计算保存时实际要提交的 roleIds。
 * - selected：弹窗中用户在候选（仅启用角色）上勾选的 id；
 * - current：回显的当前已分配 id（含已禁用）；
 * - optionIds：候选列表的 id。
 * 候选里没有但当前已分配的 id（已禁用角色）原样保留。
 */
export function buildAssignRoleIds({
  selected,
  current,
  optionIds,
}: {
  selected: readonly number[];
  current: readonly number[];
  optionIds: readonly number[];
}): number[] {
  const options = new Set(optionIds);
  const kept = current.filter((id) => !options.has(id));
  return sortedIds([...new Set([...selected, ...kept])]);
}

/**
 * r19-1：时效合并的正向启用证据。
 * - fullIds：全量候选实时数据提取的 id（基线证据，始终并入）；
 * - searchIds：搜索结果提取的 id——调用方必须先用 extractEnabledRoleIds
 *   按 role.enabled === true 过滤（r20-1，见下方），仅当搜索缓存"比全量
 *   缓存更新"（searchUpdatedAt >= fullUpdatedAt）时才并入。
 * - fullHasData=false（全量首次加载前，无缓存基线可比）时也并入搜索结果。
 *
 * 为什么需要时效判断：搜索与全量走独立 queryKey、全量缓存成功不刷新。
 * 场景：角色 9 启用时搜索缓存得到 [9] → 切关键词 → 9 被禁用、全量刷新为
 * [1,2] → 回原关键词时 30s staleTime 内复用旧缓存 [9]（0 请求）。无条件
 * 并集会让 staleAssignedRoles 把 9 视为启用、"当前已禁用"提示错误消失
 * （保存语义仍正确，只是展示回归）。
 *
 * r20-1 根因补记：时效判据单独不足以挡住 LIKE-OR 漏入的禁用角色——弹窗
 * 打开时全量先落数据（fullUpdatedAt=t0），随后的每次常规搜索都必然
 * searchUpdatedAt > t0、判据恒放行。后端 wrapper.like(name).or().like(code)
 * .eq(enabled,true) 缺括号展开为 name LIKE ? OR (code LIKE ? AND enabled=true)，
 * 名称命中的禁用角色每次都会漏进搜索结果。因此"搜索结果比全量更新"不是
 * 可靠的启用证据（旧注释"只有比全量更新的那一次搜索才值得信任"有误）：
 * 必须在提取时先按 role.enabled === true 过滤（BaseRoleVO 复制真实 enabled，
 * 前端 RoleResponse.enabled 可信），时效判据保留为第二道防线。
 */
export function mergeLiveEnabledIds({
  fullIds,
  fullHasData,
  fullUpdatedAt,
  searchIds,
  searchUpdatedAt,
}: {
  fullIds: readonly number[];
  fullHasData: boolean;
  fullUpdatedAt: number;
  searchIds: readonly number[];
  searchUpdatedAt: number;
}): number[] {
  const merged = [...fullIds];
  if (!fullHasData || searchUpdatedAt >= fullUpdatedAt) {
    for (const id of searchIds) {
      if (!merged.includes(id)) merged.push(id);
    }
  }
  return merged;
}

/**
 * 候选列表里没有的当前已分配角色（保存时将保持不变的那批）。
 *
 * r17-1：liveEnabledIds 传入当前实际启用的 id（keyword 为空的全量候选实时
 * 数据，绝不能用搜索过滤后的子集）——快照锁定后会话期间重新启用的角色不再
 * 被标为"已禁用"，文案必须与事实一致；这类角色改由
 * retainedOutsideSnapshotRoles 在展示层只读标注。
 *
 * r19-1：liveEnabledIds 由 mergeLiveEnabledIds 时效合并——搜索结果仅当
 * 比全量缓存更新时才视为启用证据；陈旧搜索缓存中的禁用角色不再被误标启用。
 *
 * r20-1：搜索证据在提取时已按 role.enabled === true 预过滤
 * （extractEnabledRoleIds），LIKE-OR 漏入的禁用角色连时效判据都到不了；
 * 时效判据保留为第二道防线。
 */
export function staleAssignedRoles(
  current: readonly RoleResponse[],
  optionIds: readonly number[],
  liveEnabledIds: readonly number[] = [],
): RoleResponse[] {
  const options = new Set(optionIds);
  const liveEnabled = new Set(liveEnabledIds);
  return current.filter(
    (role) => !options.has(role.id) && !liveEnabled.has(role.id),
  );
}

/**
 * r17-1：快照外但当前已启用的已分配角色（会话期间重新启用，或快照锁定时
 * 用的陈旧缓存）。
 * 保存时 buildAssignRoleIds 会自动保留它们（current ∉ snapshot → kept），
 * 因此展示层必须只读标注、不可勾选——不能假装"取消勾选"能生效。
 */
export function retainedOutsideSnapshotRoles(
  current: readonly RoleResponse[],
  snapshotIds: readonly number[],
  liveEnabledIds: readonly number[],
): RoleResponse[] {
  const snapshot = new Set(snapshotIds);
  const liveEnabled = new Set(liveEnabledIds);
  return current.filter(
    (role) => !snapshot.has(role.id) && liveEnabled.has(role.id),
  );
}

/**
 * 脏检查基线：把初始已分配 id 过滤到"全量启用候选"范围内。
 * 选中态（selected）只装候选内的 id，比较双方必须在同一范围；
 * 基线来自稳定的初始快照，绝不随搜索关键词变化——搜索只影响展示。
 *
 * r16-2：第二个参数必须是弹窗本轮锁定的全量快照，绝不能传实时刷新的
 * fullOptions.data——后台刷新会漂移基线，让未编辑的表单"被变脏"，
 * 进而在保存时误删角色。
 */
export function selectionDirtyBaseline(
  initial: readonly number[],
  fullOptionIds: readonly number[],
): number[] {
  const full = new Set(fullOptionIds);
  return initial.filter((id) => full.has(id));
}

/**
 * r16-1：播种选中态 = 初始已分配 id ∩ 锁定的全量启用候选。
 * 播种与快照锁定在组件同一 effect 内原子完成：快照非空即播种完成，
 * 快照为空时勾选被禁用——不存在"可修改但未播种"的编辑窗口，
 * 迟到的播种也就无从覆盖用户修改。
 */
export function seedSelection(
  assignedIds: readonly number[],
  fullOptionIds: readonly number[],
): number[] {
  const full = new Set(fullOptionIds);
  return assignedIds.filter((id) => full.has(id));
}

/**
 * r16-1/r16-3：勾选可编辑门禁。
 * - snapshotReady：全量快照已锁定（= 播种已完成），否则勾选无意义且
 *   会被迟到的播种覆盖，同时 dirty 基线为 null 会让关闭跳过确认；
 * - busy：保存在途，勾选会产生"已发载荷之外"的修改，被成功回调丢弃。
 */
export function isSelectionEditable({
  snapshotReady,
  busy,
}: {
  snapshotReady: boolean;
  busy: boolean;
}): boolean {
  return snapshotReady && !busy;
}

/** 纯切换：选中态里增删一个 id（顺序无关的集合语义）。 */
export function toggleSelection(
  selected: readonly number[],
  roleId: number,
): number[] {
  return selected.includes(roleId)
    ? selected.filter((id) => id !== roleId)
    : [...selected, roleId];
}

/**
 * r16-3：带门禁的勾选切换——不可编辑时（播种未完成/保存在途）原样返回，
 * 作为勾选框 disabled 的兜底拦截。
 */
export function guardedToggleSelection(
  selected: readonly number[],
  roleId: number,
  editable: boolean,
): number[] {
  if (!editable) return [...selected];
  return toggleSelection(selected, roleId);
}

/** 候选区错误展示态（r16-4）。 */
export type RoleOptionsErrorView = "none" | "hard" | "stale-warning";

/**
 * r16-4：候选错误展示态判定。
 * - options 查询失败 → "hard"：无可展示内容，整块报错 + 重试；
 * - 仅全量候选后台刷新失败：
 *   - 无缓存数据 → "hard"：基线/保存都无从谈起，整块报错 + 重试；
 *   - 有缓存数据 → "stale-warning"：列表照常展示（勾选可用），顶部警告
 *     横幅说明"已用缓存数据，保存暂时不可用"并给重试入口——保存被禁用
 *     不再是无声的。
 */
export function roleOptionsErrorView({
  optionsIsError,
  fullIsError,
  fullHasData,
}: {
  optionsIsError: boolean;
  fullIsError: boolean;
  fullHasData: boolean;
}): RoleOptionsErrorView {
  if (optionsIsError) return "hard";
  if (fullIsError && !fullHasData) return "hard";
  if (fullIsError) return "stale-warning";
  return "none";
}

/**
 * r16-5：保存会话有效性。handleSave 在 await mutateAsync 前后各取一次
 * 会话 token（弹窗每轮打开/关闭/卸载时递增）：若期间会话已失效——用户已
 * 关闭弹窗、组件已卸载（干净表单离开不被路由守卫拦截）、或新开了一轮——
 * 成功回调必须跳过 markClean/doClose 与后续导航，不能把已离开的用户拉回。
 */
export function isSaveSessionValid(captured: number, current: number): boolean {
  return captured === current;
}
