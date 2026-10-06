/**
 * 用户分配角色弹窗（P5：p5-user-roles）。
 *
 * - 打开时 GET /user/v1/roles/{userId} 回显用户当前已选角色；
 * - 候选角色多选走 GET /role/v1/list?keyword=（keyword 为空时后端只返回
 *   enabled=true 的角色；带关键词搜索时后端 like-or 缺括号，名称命中的
 *   禁用角色会漏进结果——搜索证据先按 role.enabled === true 过滤
 *   （extractEnabledRoleIds，r20-1），再以 mergeLiveEnabledIds 时效判据
 *   合并到正向启用证据）；
 * - 保存走 POST /user/v1/assignRoles { userId, roleIds }（全量替换）：
 *   已分配但已禁用的角色不在候选里，保存时原样保留（见 user-roles.buildAssignRoleIds），
 *   并在弹窗内明确告知用户；
 * - 搜索只影响展示：dirty 比较、保存提交、"已禁用"提示一律按本轮弹窗打开时
 *   锁定的全量启用候选快照算基线；快照未锁定（播种未完成）或后台刷新失败时
 *   禁止保存；后台刷新失败但有缓存时展示警告横幅+重试（r16-4），不再静默；
 * - 快照未锁定或保存在途时勾选全部禁用（r16-1/r16-3），toggle 入口同样拦截；
 * - 保存成功回调先校验保存会话有效性，无效会话跳过关闭与导航（r16-5）；
 * - r17-1：快照锁定后会话期间重新启用的角色——stale 提示不再误标"已禁用"
 *   （文案与事实一致），候选区对这类"快照外保留角色"只读标注、不可勾选
 *   （保存会自动保留，UI 诚实说明而不是假装可取消）；
 * - r17-2：保存失败分支同样校验保存会话有效性，无效会话不写错误状态——
 *   同一路由切换用户时组件复用，旧用户在途请求失败不能污染新用户表单；
 * - r18-1：正向启用证据并入搜索结果（搜索用独立 queryKey，成功不刷新全量
 *   缓存）；只读保留集合改为保存 kept 集（锁定回显−锁定快照）——展示承诺与
 *   保存语义一致，取消勾选无法生效的路径不再假装可编辑；
 * - r18-2：stale/retained 展示改以锁定的初始回显为源，与保存载荷同源——
 *   实时回显的后台刷新不再改动"自动保留"承诺，杜绝"承诺保留、保存移除"。
 * - r19-1：liveEnabledIds 时效合并（mergeLiveEnabledIds）——陈旧搜索缓存
 *   与后端 like-or 缺括号漏进的禁用角色不再污染正向启用证据；"当前已禁用"
 *   提示恢复诚实。
 * - r19-2：保存失败后，实际生效的勾选变更清除 submitError（表单 UX 硬约定
 *   "用户编辑该字段时清除其错误"）；被门禁拦截的编辑不清除（r16-3 语义不变）。
 * - r20-1：LIKE-OR 漏入闭合——弹窗打开时全量先落数据（fullUpdatedAt=t0），
 *   随后的每次常规搜索都必然 searchUpdatedAt > t0，时效判据恒放行，挡不住
 *   like-or 缺括号漏进搜索结果的名称命中禁用角色；搜索证据改用
 *   extractEnabledRoleIds 按 role.enabled === true 预过滤，时效判据保留为
 *   第二道防线。"当前已禁用"提示在搜索返回禁用角色时不再错误消失。
 * - 表单 UX 约定：选择变更后关闭弹窗需 dirty 确认（useUnsavedChangesGuard，
 *   blocker 独立于 AppModal 挂载）；错误提示挂在弹窗内对应位置，不只 toast；
 *   本弹窗无必填字段概念，不用 RequiredMark。
 */
import { useEffect, useRef, useState } from "react";
import { Button, Chip, Input, Spinner } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  EmptyHint,
  FilterCheckbox,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  buildAssignRoleIds,
  extractEnabledRoleIds,
  extractRoleIds,
  guardedToggleSelection,
  isSaveSessionValid,
  isSelectionEditable,
  mergeLiveEnabledIds,
  roleDisplayName,
  roleOptionsErrorView,
  sameIdSet,
  seedSelection,
  selectionDirtyBaseline,
  staleAssignedRoles,
} from "@/lib/user-roles";
import {
  toUserMessage,
  useAssignUserRoles,
  useRoleOptions,
  useUserDetail,
  useUserRoles,
} from "@/lib/query";
import type { RoleResponse } from "@/lib/api/system-types";

export function UserRolesDialog({
  open,
  userId,
  onClose,
}: {
  open: boolean;
  /** 要分配角色的用户 id；null 时弹窗不渲染内容 */
  userId: number | null;
  onClose: () => void;
}) {
  const assignRoles = useAssignUserRoles();
  const busy = assignRoles.isPending;

  const detail = useUserDetail(userId, open && userId != null);
  const assigned = useUserRoles(userId, open && userId != null);

  // 关键词搜索提交态：只有点"搜索"才真正发请求，避免每次敲字都换 queryKey
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState("");
  // 展示用候选（受搜索影响）。
  const options = useRoleOptions(submitted);
  // 基线用全量启用候选（keyword 为空）：dirty 比较、保存提交、"已禁用"提示
  // 都以它为准，不受搜索影响。与初始展示查询同 queryKey，react-query 去重，
  // 不产生额外请求。
  const fullOptions = useRoleOptions("");

  // 当前已选（用户在候选列表上勾选的 id）；初始快照为回显的已分配 id。
  const [selected, setSelected] = useState<number[]>([]);
  // r16-2：本轮弹窗锁定的全量启用候选快照——dirty 基线、保存基线、
  // "已禁用"提示全部以它为准，后台刷新不再漂移基线。
  // 快照非空 ⇔ 播种已完成；快照为空时勾选被禁用（r16-1）。
  const [fullSnapshot, setFullSnapshot] = useState<number[] | null>(null);
  const initialRef = useRef<number[] | null>(null);
  // r18-2：锁定的初始回显角色（含 RoleResponse，供"已禁用"提示取展示名）。
  // stale/retained 展示一律以它为源，与保存载荷（handleSave 的 buildAssignRoleIds，
  // current=initialRef）同源——实时 assigned.data 的后台刷新不再漂移展示承诺。
  const initialRolesRef = useRef<RoleResponse[] | null>(null);
  const initializedForRef = useRef<number | null>(null);
  const selectedSeededForRef = useRef<number | null>(null);
  // r16-5：保存会话 token。弹窗每轮打开/切换用户时 +1，关闭与卸载时 +1
  // 作废在途会话——await 之后先比对，无效会话跳过关闭与导航。
  const saveSessionRef = useRef(0);
  useEffect(() => {
    if (open && userId != null) {
      saveSessionRef.current += 1;
    }
  }, [open, userId]);
  useEffect(
    () => () => {
      saveSessionRef.current += 1;
    },
    [],
  );
  // 回显到达后一次性记录初始快照（含已禁用角色 id）：dirty 与保存都以它为基准。
  useEffect(() => {
    if (!open || userId == null || !assigned.data) return;
    if (initializedForRef.current === userId) return;
    initializedForRef.current = userId;
    initialRef.current = extractRoleIds(assigned.data);
    initialRolesRef.current = [...assigned.data];
    // 同一弹窗切换用户时先作废旧快照：勾选保持禁用直到新一轮播种完成。
    setFullSnapshot(null);
  }, [open, userId, assigned.data]);
  // 播种与快照锁定在同一 effect 内原子完成（r16-1/r16-2）：回显与全量候选
  // 首次同时就绪时，把初始快照里仍在候选的 id 补进选中态（回显里可能有
  // 已禁用角色，全量候选不含；buildAssignRoleIds 会在保存时把候选外已分配
  // 的原样补回），同时锁定本轮的全量快照。之后搜索只影响展示范围，
  // 后台刷新也不再改动快照——迟到的播种/刷新都无从覆盖用户修改或漂移基线。
  useEffect(() => {
    if (!open || userId == null || !assigned.data || !fullOptions.data) return;
    if (selectedSeededForRef.current === userId) return;
    selectedSeededForRef.current = userId;
    const fullIds = extractRoleIds(fullOptions.data);
    setFullSnapshot(fullIds);
    setSelected(seedSelection(extractRoleIds(assigned.data), fullIds));
  }, [open, userId, assigned.data, fullOptions.data]);

  // r16-1/r16-3：勾选可编辑门禁——快照未锁定（播种未完成）或保存在途时
  // 全部禁用；toggle 入口同样拦截作为兜底。
  const editable = isSelectionEditable({
    snapshotReady: fullSnapshot !== null,
    busy,
  });
  const toggle = (roleId: number) => {
    // r19-2：被门禁拦截的编辑（快照未锁定/保存在途）不清除保存错误——
    // 编辑并未真正生效；只有实际生效的勾选变更才清错（表单 UX 硬约定：
    // 用户编辑该字段时清除其错误）。
    if (!editable) return;
    setSelected((current) => guardedToggleSelection(current, roleId, editable));
    setSubmitError("");
  };

  // dirty：以锁定的全量快照为基线范围（r16-2），与保存基线同源；
  // 快照未就绪前视为不脏——此时勾选已禁用、保存按钮也被禁用，
  // 不存在可丢失的用户编辑，关闭无需确认。
  const baselineSelected =
    initialRef.current === null || fullSnapshot === null
      ? null
      : selectionDirtyBaseline(initialRef.current, fullSnapshot);
  const isDirty =
    baselineSelected !== null && !sameIdSet(selected, baselineSelected);
  // 弹窗打开且脏时布防：拦截浏览器后退/刷新/关标签页
  const { guard: navGuard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    open && isDirty,
  );

  const [submitError, setSubmitError] = useState("");

  const doClose = () => {
    setSelected([]);
    setSubmitError("");
    setKeyword("");
    setSubmitted("");
    setFullSnapshot(null);
    initialRef.current = null;
    initialRolesRef.current = null;
    initializedForRef.current = null;
    selectedSeededForRef.current = null;
    // r16-5：关闭即作废本轮所有在途保存会话。
    saveSessionRef.current += 1;
    onClose();
  };

  const close = () => {
    // 保存请求在途时不允许关闭：回调里会关闭弹窗并重置状态，避免新旧流程污染。
    if (busy) return;
    navGuard(doClose);
  };

  const handleSearch = () => setSubmitted(keyword);
  const handleReset = () => {
    setKeyword("");
    setSubmitted("");
  };

  // 保存基线就绪：初始快照 + 锁定的全量快照都已就绪，且全量查询无错误。
  // 快照未锁定（播种未完成）时禁止提交（r16-1）；全量后台刷新失败时保存
  // 禁用，由 stale-warning 横幅解释原因并提供重试（r16-4），不再静默。
  const saveReady =
    fullSnapshot !== null &&
    !fullOptions.isError &&
    initialRef.current !== null;

  const handleSave = async () => {
    if (busy || userId == null || !saveReady) return;
    setSubmitError("");
    // r16-5：保存会话 token 化——await 后比对，会话已失效则跳过关闭/导航。
    const session = saveSessionRef.current;
    // 基线必须是锁定的全量启用候选快照（r16-2）：搜索过滤子集与实时刷新的
    // fullOptions.data 都绝不能做 optionIds，否则基线漂移会凭空产生删除意图。
    const optionIds = fullSnapshot ?? [];
    const roleIds = buildAssignRoleIds({
      selected,
      current: initialRef.current ?? [],
      optionIds,
    });
    try {
      await assignRoles.mutateAsync({ userId, roleIds });
      // 会话已失效（弹窗已关闭/组件已卸载/新开一轮）→ 跳过成功回调的
      // 关闭与导航，避免把已离开的用户拉回用户列表。
      if (!isSaveSessionValid(session, saveSessionRef.current)) return;
      toast.success("角色分配已保存");
      // 成功=已授权离开：先 markClean 再程序化关闭，避免守卫拦截
      markClean();
      doClose();
    } catch (error) {
      // r17-2：失败分支同样校验保存会话有效性——同一路由切换用户时组件复用
      // （无用户级 key），旧用户在途请求失败后错误不能写入新用户表单。
      if (!isSaveSessionValid(session, saveSessionRef.current)) return;
      setSubmitError(`保存失败：${toUserMessage(error)}`);
    }
  };

  // r19-1：正向启用证据 = 全量候选实时数据 ∪ "比全量更新"的搜索结果
  // （mergeLiveEnabledIds 时效合并）。
  // r20-1：搜索证据先按 role.enabled === true 过滤（extractEnabledRoleIds），
  // 再跑时效判据。原因：弹窗打开时全量先落数据（fullUpdatedAt=t0），随后
  // 的每次常规搜索都必然 searchUpdatedAt > t0，时效判据恒放行，挡不住后端
  // like-or 缺括号漏进搜索结果的名称命中禁用角色（RoleController
  // wrapper.like(name).or().like(code).eq(enabled,true) 缺括号 → SQL 展开为
  // name LIKE ? OR (code LIKE ? AND enabled=true)）。时效判据保留为第二道
  // 防线（陈旧搜索缓存场景）。
  const liveEnabledIds = mergeLiveEnabledIds({
    fullIds: extractRoleIds(fullOptions.data ?? []),
    fullHasData: fullOptions.data != null,
    fullUpdatedAt: fullOptions.dataUpdatedAt,
    searchIds: extractEnabledRoleIds(options.data ?? []),
    searchUpdatedAt: options.dataUpdatedAt,
  });
  // r18-2："当前已禁用"提示以锁定的初始回显为源（与保存基线同源，r16-2），
  // 不再用实时 assigned.data——后台刷新不再漂移提示内容。
  const staleRoles: RoleResponse[] =
    initialRolesRef.current && fullSnapshot
      ? staleAssignedRoles(
          initialRolesRef.current,
          fullSnapshot,
          liveEnabledIds,
        )
      : [];
  // r18-1/r18-2：只读保留集合 = 保存时 buildAssignRoleIds 实际会保留的 kept
  // 集合（锁定回显 − 锁定快照），不再按实时回显/启用状态二次过滤——展示承诺
  // 与保存语义严格一致：保存会保留的，展示为只读"自动保留"不可取消；
  // 展示允许取消勾选的，保存一定不再提交。
  const saveRetainedIds = new Set(
    initialRolesRef.current && fullSnapshot
      ? extractRoleIds(initialRolesRef.current).filter(
          (id) => !fullSnapshot.includes(id),
        )
      : [],
  );
  const userName = detail.data?.username ?? detail.data?.cnName ?? null;
  // 候选区错误展示态（r16-4）：后台刷新失败但有缓存时不隐藏列表，
  // 改为警告横幅 + 重试入口；保存仍被 saveReady 禁用，横幅内说明原因。
  const errorView = roleOptionsErrorView({
    optionsIsError: options.isError,
    fullIsError: fullOptions.isError,
    fullHasData: fullOptions.data != null,
  });
  const loading =
    open && userId != null && (detail.isLoading || assigned.isLoading);
  const loadError = assigned.isError ? assigned.error : null;

  return (
    <>
      {/*
        blocker 必须独立于 AppModal 挂载：弹窗关闭不能卸载一个正在等待用户作答
        的路由拦截，否则那次导航会永远挂起。
      */}
      {blocker}
      <AppModal
        open={open}
        title={userName ? `为「${userName}」分配角色` : "分配角色"}
        onClose={close}
        size="md"
      >
        {dialog}
        {userId == null ? null : loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-default-500">
            <Spinner size="sm" />
            正在加载已分配角色…
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p className="text-sm text-danger">
              加载失败：{toUserMessage(loadError, "加载用户角色失败")}
            </p>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={assigned.isRefetching}
              onPress={() => {
                void assigned.refetch();
              }}
            >
              重试
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Input
                aria-label="搜索角色"
                placeholder="角色名称或编码"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch();
                }}
              />
              <Button size="sm" variant="primary" onPress={handleSearch}>
                搜索
              </Button>
              <Button size="sm" variant="ghost" onPress={handleReset}>
                重置
              </Button>
            </div>

            {options.isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-default-500">
                <Spinner size="sm" />
                正在加载可选角色…
              </div>
            ) : errorView === "hard" ? (
              <div className="flex items-center gap-3 py-6 text-sm text-danger">
                <span>
                  加载失败：
                  {toUserMessage(
                    options.isError ? options.error : fullOptions.error,
                    "加载角色列表失败",
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={options.isRefetching || fullOptions.isRefetching}
                  onPress={() => {
                    void options.refetch();
                    void fullOptions.refetch();
                  }}
                >
                  重试
                </Button>
              </div>
            ) : (
              <>
                {errorView === "stale-warning" ? (
                  <div
                    role="alert"
                    className="flex items-center gap-3 rounded-sm border border-border bg-warning-soft px-3 py-2 text-sm text-warning"
                  >
                    <span>
                      全量角色信息刷新失败：
                      {toUserMessage(fullOptions.error, "加载角色列表失败")}
                      ，已使用缓存数据，保存暂时不可用。
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={fullOptions.isRefetching}
                      onPress={() => {
                        void fullOptions.refetch();
                      }}
                    >
                      重试
                    </Button>
                  </div>
                ) : null}
                {(options.data ?? []).length === 0 ? (
                  <EmptyHint>没有可选角色（只列出已启用的角色）</EmptyHint>
                ) : (
                  <fieldset className="flex flex-col gap-1 rounded-sm border border-border p-2">
                    <legend className="px-1 text-xs text-default-500">
                      可选角色（只含已启用）
                    </legend>
                    {(options.data ?? []).map((role) => {
                      // r18：保存保留集合（kept）内的角色只读展示为已勾选——
                      // 取消勾选无法生效时不假装可编辑，承诺与保存语义一致。
                      const retained = saveRetainedIds.has(role.id);
                      return (
                        <div
                          key={role.id}
                          className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-surface"
                        >
                          <FilterCheckbox
                            label={roleDisplayName(role)}
                            checked={retained || selected.includes(role.id)}
                            onChange={() => toggle(role.id)}
                            isDisabled={retained || !editable}
                          />
                          <div className="flex items-center gap-2">
                            {retained ? (
                              <span
                                className="text-xs text-default-400"
                                title="该角色不在本轮快照内：保存时将自动保留，重新打开弹窗后可调整"
                              >
                                保存时自动保留，不可更改
                              </span>
                            ) : null}
                            {role.roleCode ? (
                              <Chip size="sm" variant="soft" color="default">
                                {role.roleCode}
                              </Chip>
                            ) : null}
                            {role.description ? (
                              <span className="max-w-48 truncate text-xs text-default-400">
                                {role.description}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </fieldset>
                )}
              </>
            )}

            {staleRoles.length > 0 ? (
              <p className="text-xs text-default-500">
                以下已分配角色当前已禁用，不在此处列出，保存时将保持不变：
                {staleRoles.map(roleDisplayName).join("、")}
              </p>
            ) : null}

            {submitError ? (
              <p role="alert" className="type-body text-danger">
                {submitError}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-default-500">
                已选 {selected.length + saveRetainedIds.size} 个角色
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onPress={close} isDisabled={busy}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  onPress={() => {
                    void handleSave();
                  }}
                  isDisabled={busy || !saveReady}
                >
                  {busy ? "保存中…" : "保存"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </AppModal>
    </>
  );
}
