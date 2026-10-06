/**
 * user-roles 纯逻辑 helper 单元测试（vitest）。
 */
import { describe, expect, test } from 'vitest';
import {
  buildAssignRoleIds,
  extractEnabledRoleIds,
  extractRoleIds,
  guardedToggleSelection,
  isSaveSessionValid,
  isSelectionEditable,
  mergeLiveEnabledIds,
  retainedOutsideSnapshotRoles,
  roleDisplayName,
  roleOptionsErrorView,
  sameIdSet,
  seedSelection,
  selectionDirtyBaseline,
  sortedIds,
  staleAssignedRoles,
  toggleSelection,
} from '../user-roles';
import type { RoleResponse } from '../api/system-types';

function role(id: number, overrides: Partial<RoleResponse> = {}): RoleResponse {
  return {
    id,
    roleName: `角色${id}`,
    roleCode: `ROLE_${id}`,
    description: null,
    enabled: true,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe('roleDisplayName', () => {
  test('优先用 roleName，其次 roleCode，最后 #id', () => {
    expect(roleDisplayName(role(1))).toBe('角色1');
    expect(roleDisplayName(role(2, { roleName: null }))).toBe('ROLE_2');
    expect(roleDisplayName(role(3, { roleName: '  ', roleCode: null }))).toBe('#3');
  });
});

describe('sortedIds / sameIdSet', () => {
  test('顺序无关比较', () => {
    expect(sortedIds([3, 1, 2])).toEqual([1, 2, 3]);
    expect(sameIdSet([1, 2], [2, 1])).toBe(true);
    expect(sameIdSet([1], [1, 2])).toBe(false);
    expect(sameIdSet([], [])).toBe(true);
    expect(sameIdSet([1, 1], [1])).toBe(false);
  });
});

describe('buildAssignRoleIds', () => {
  test('候选外已分配（已禁用）角色原样保留', () => {
    // 当前已分配 [1,2,9]，候选只有 [1,2,3]（9 已禁用），用户勾选 [1,3]
    const result = buildAssignRoleIds({
      selected: [1, 3],
      current: [1, 2, 9],
      optionIds: [1, 2, 3],
    });
    // 9 被保留，2 被取消勾选
    expect(result).toEqual([1, 3, 9]);
  });

  test('无残留时直接就是选中集合', () => {
    expect(
      buildAssignRoleIds({ selected: [2], current: [1, 2], optionIds: [1, 2, 3] }),
    ).toEqual([2]);
  });

  test('全部取消且无残留时提交空数组', () => {
    expect(
      buildAssignRoleIds({ selected: [], current: [1], optionIds: [1, 2] }),
    ).toEqual([]);
  });
});

describe('staleAssignedRoles', () => {
  test('只返回候选里没有的已分配角色', () => {
    const current = [role(1), role(2), role(9, { enabled: false })];
    expect(extractRoleIds(staleAssignedRoles(current, [1, 2]))).toEqual([9]);
  });

  test('r15 回归：按全量候选算，不匹配关键词的已启用角色不误标为"已禁用"', () => {
    const current = [role(1), role(2), role(9, { enabled: false })];
    // 全量启用候选 [1,2,3]：只有真正禁用的 9 被标出
    expect(extractRoleIds(staleAssignedRoles(current, [1, 2, 3]))).toEqual([9]);
  });

  test('r17-1：快照外但当前已启用的角色（会话期间重新启用）不再标为"已禁用"', () => {
    const current = [role(1), role(2), role(9, { enabled: false })];
    // 快照 [1,2] 锁定后 9 被重新启用：当前启用 [1,2,9]
    expect(extractRoleIds(staleAssignedRoles(current, [1, 2], [1, 2, 9]))).toEqual(
      [],
    );
  });

  test('r17-1：真正仍禁用的角色继续标出', () => {
    const current = [role(1), role(9, { enabled: false })];
    expect(extractRoleIds(staleAssignedRoles(current, [1, 2], [1, 2]))).toEqual([
      9,
    ]);
  });
});

describe('retainedOutsideSnapshotRoles（r17-1）', () => {
  test('只返回快照外但当前已启用的已分配角色', () => {
    const current = [role(1), role(2), role(9, { enabled: false })];
    // 快照 [1,2]，9 会话期间重新启用 → 只有 9 是快照外保留角色
    expect(
      extractRoleIds(retainedOutsideSnapshotRoles(current, [1, 2], [1, 2, 9])),
    ).toEqual([9]);
  });

  test('仍禁用的角色不在其中（归 stale 管）', () => {
    const current = [role(1), role(9, { enabled: false })];
    expect(
      extractRoleIds(retainedOutsideSnapshotRoles(current, [1, 2], [1, 2])),
    ).toEqual([]);
  });

  test('快照内的已启用角色不在其中', () => {
    const current = [role(1), role(2)];
    expect(
      extractRoleIds(
        retainedOutsideSnapshotRoles(current, [1, 2], [1, 2, 3]),
      ),
    ).toEqual([]);
  });

  test('stale 与 retained 互斥且覆盖全部快照外已分配角色', () => {
    const current = [role(1), role(8), role(9, { enabled: false })];
    // 快照 [1,2]：8 会话期间重新启用，9 仍禁用
    const stale = staleAssignedRoles(current, [1, 2], [1, 2, 8]);
    const retained = retainedOutsideSnapshotRoles(current, [1, 2], [1, 2, 8]);
    expect(extractRoleIds(stale)).toEqual([9]);
    expect(extractRoleIds(retained)).toEqual([8]);
  });
});

describe('selectionDirtyBaseline（r15 回归）', () => {
  test('只保留全量候选范围内的初始 id，已禁用不计入脏比较', () => {
    expect(selectionDirtyBaseline([1, 2, 9], [1, 2, 3])).toEqual([1, 2]);
  });

  test('基线与搜索过滤无关：同一快照在不同关键词下基线一致', () => {
    // 搜索只影响展示，基线恒按全量候选算——搜索返回 [3] 时基线仍是 [1]
    const baseline = selectionDirtyBaseline([1, 9], [1, 2]);
    expect(baseline).toEqual([1]);
    expect(sameIdSet([1], baseline)).toBe(true); // 未改不动
    expect(sameIdSet([1, 2], baseline)).toBe(false); // 勾选 2 后变脏
    expect(sameIdSet([], baseline)).toBe(false); // 搜索清空选中态的旧 bug 会误判干净
  });
});

describe('seedSelection（r16-1 回归）', () => {
  test('播种 = 初始已分配 ∩ 锁定的全量启用候选', () => {
    // 回显 [1,9]（9 已禁用），全量启用候选 [1,2] → 播种 [1]
    expect(seedSelection([1, 9], [1, 2])).toEqual([1]);
    expect(seedSelection([1, 2], [1, 2, 3])).toEqual([1, 2]);
    expect(seedSelection([], [1, 2])).toEqual([]);
  });

  test('播种与快照锁定原子完成：快照非空即播种完成，不存在可编辑但未播种的窗口', () => {
    // 组件层约定：fullSnapshot === null 时勾选全部禁用（isSelectionEditable），
    // 用户在播种前做不出任何修改，迟到的播种无从覆盖。
    expect(isSelectionEditable({ snapshotReady: false, busy: false })).toBe(false);
  });
});

describe('isSelectionEditable（r16-1/r16-3 回归）', () => {
  test('快照未锁定或保存在途时勾选不可编辑', () => {
    expect(isSelectionEditable({ snapshotReady: false, busy: false })).toBe(false);
    expect(isSelectionEditable({ snapshotReady: true, busy: true })).toBe(false);
    expect(isSelectionEditable({ snapshotReady: false, busy: true })).toBe(false);
    expect(isSelectionEditable({ snapshotReady: true, busy: false })).toBe(true);
  });
});

describe('guardedToggleSelection（r16-3 回归）', () => {
  test('可编辑时正常增删', () => {
    expect(toggleSelection([1], 2)).toEqual([1, 2]);
    expect(toggleSelection([1, 2], 2)).toEqual([1]);
    expect(guardedToggleSelection([1], 2, true)).toEqual([1, 2]);
    expect(guardedToggleSelection([1, 2], 1, true)).toEqual([2]);
  });

  test('保存在途 / 播种未完成时 toggle 原样返回，修改不丢失也不生效', () => {
    // 复现：在途保存时再勾选 2，成功回调 markClean+doClose 会丢弃该修改；
    // 修复后 toggle 入口直接拦截，选中态保持 [1]。
    expect(guardedToggleSelection([1], 2, false)).toEqual([1]);
    expect(guardedToggleSelection([1, 2], 1, false)).toEqual([1, 2]);
  });
});

describe('roleOptionsErrorView（r16-4 回归）', () => {
  test('展示查询失败 → hard 整块报错', () => {
    expect(
      roleOptionsErrorView({ optionsIsError: true, fullIsError: false, fullHasData: true }),
    ).toBe('hard');
  });

  test('全量候选失败且无缓存 → hard 整块报错', () => {
    expect(
      roleOptionsErrorView({ optionsIsError: false, fullIsError: true, fullHasData: false }),
    ).toBe('hard');
  });

  test('全量候选后台刷新失败但有缓存 → stale-warning：列表照常展示 + 警告横幅 + 重试', () => {
    // 复现：有缓存时后台刷新失败，旧条件 (fullOptions.isError && !fullOptions.data)
    // 为假导致错误横幅被隐藏，保存被禁用却无提示无重试。
    expect(
      roleOptionsErrorView({ optionsIsError: false, fullIsError: true, fullHasData: true }),
    ).toBe('stale-warning');
  });

  test('无错误 → none', () => {
    expect(
      roleOptionsErrorView({ optionsIsError: false, fullIsError: false, fullHasData: true }),
    ).toBe('none');
    expect(
      roleOptionsErrorView({ optionsIsError: false, fullIsError: false, fullHasData: false }),
    ).toBe('none');
  });
});

describe('isSaveSessionValid（r16-5 回归）', () => {
  test('会话一致 → 有效，继续关闭与导航', () => {
    expect(isSaveSessionValid(5, 5)).toBe(true);
  });

  test('会话已失效（关闭/卸载/新开一轮）→ 跳过关闭与导航', () => {
    // 复现：干净表单保存 POST 在途时浏览器后退，组件卸载不取消 await 后续代码，
    // 旧请求成功后把用户拉回 /sys/users；修复后卸载时 token+1，比对失败直接返回。
    expect(isSaveSessionValid(5, 6)).toBe(false);
  });
});

describe('锁定快照语义（r16-2 回归）', () => {
  test('后台刷新全量候选后，未编辑表单不"被变脏"、保存不误删角色', () => {
    // 初始已分配 [1,9]（9 已禁用），打开时全量启用候选 [1,2]。
    const initial = [1, 9];
    const snapshot = [1, 2]; // 弹窗本轮锁定的快照
    const selected = seedSelection(initial, snapshot); // 播种 [1]
    const baseline = selectionDirtyBaseline(initial, snapshot); // 基线 [1]
    expect(sameIdSet(selected, baseline)).toBe(true); // 未编辑 → 干净

    // 随后 9 被重新启用，后台刷新全量候选为 [1,2,9]：
    // 修复前基线按实时 fullOptions.data 重算 → [1,9] → 无端变脏，
    // 保存 optionIds=[1,2,9] → kept 排除 9 → 提交 [1]，静默移除角色 9。
    const refreshedLive = [1, 2, 9];
    const buggyPayload = buildAssignRoleIds({
      selected,
      current: initial,
      optionIds: refreshedLive,
    });
    expect(buggyPayload).toEqual([1]); // 记录旧 bug 的行为，供对照

    // 修复后：基线/保存/提示全部走锁定快照 [1,2]，刷新不产生删除意图。
    const fixedBaseline = selectionDirtyBaseline(initial, snapshot);
    expect(sameIdSet(selected, fixedBaseline)).toBe(true); // 仍干净
    const fixedPayload = buildAssignRoleIds({
      selected,
      current: initial,
      optionIds: snapshot,
    });
    expect(fixedPayload).toEqual([1, 9]); // 9 被原样保留
    const current = [role(1), role(9, { enabled: false })];
    expect(extractRoleIds(staleAssignedRoles(current, snapshot))).toEqual([9]);
  });
});

describe('buildAssignRoleIds（r15 回归）', () => {
  test('optionIds 传全量启用候选：已取消的启用角色不被复活', () => {
    // 初始 [1(启用),9(禁用)]，用户取消 1、勾选 2；全量候选 [1,2]
    const result = buildAssignRoleIds({
      selected: [2],
      current: [1, 9],
      optionIds: [1, 2],
    });
    expect(result).toEqual([2, 9]);
  });

  test('搜索过滤子集绝不能做 optionIds：会把未命中关键词的启用角色误判为残留', () => {
    // 反例：若误传搜索结果 [2]，已取消的 1 会被当成"候选外残留"重新加回
    const wrong = buildAssignRoleIds({
      selected: [2],
      current: [1, 9],
      optionIds: [2],
    });
    expect(wrong).toEqual([1, 2, 9]);
    // 组件层修复：永远传全量候选
    const right = buildAssignRoleIds({
      selected: [2],
      current: [1, 9],
      optionIds: [1, 2],
    });
    expect(right).toEqual([2, 9]);
  });
});

describe('mergeLiveEnabledIds（r19-1 时效合并）', () => {
  const base = {
    fullIds: [1, 2],
    fullHasData: true,
    fullUpdatedAt: 1000,
    searchIds: [9],
    searchUpdatedAt: 1000,
  };

  test('全量始终并入；同时间戳的搜索（同一 queryKey）并入', () => {
    expect(mergeLiveEnabledIds(base)).toEqual([1, 2, 9]);
  });

  test('更晚的搜索结果（fresh fetch）并入', () => {
    expect(
      mergeLiveEnabledIds({ ...base, searchUpdatedAt: 2000 }),
    ).toEqual([1, 2, 9]);
  });

  test('陈旧搜索缓存（全量刷新后复用旧关键词缓存）不并入：9 仍标禁用', () => {
    // 全量刷新为 [1,2]（t=2000），回原关键词复用旧搜索缓存 [9]（t=1000）
    expect(
      mergeLiveEnabledIds({
        ...base,
        fullIds: [1, 2],
        fullUpdatedAt: 2000,
        searchUpdatedAt: 1000,
      }),
    ).toEqual([1, 2]);
  });

  test('全量首次加载前（无基线）也并入搜索结果', () => {
    expect(
      mergeLiveEnabledIds({
        ...base,
        fullIds: [],
        fullHasData: false,
        fullUpdatedAt: 0,
      }),
    ).toEqual([9]);
  });

  test('去重：搜索与全量重叠的 id 只出现一次', () => {
    expect(
      mergeLiveEnabledIds({
        ...base,
        searchIds: [2, 9],
      }),
    ).toEqual([1, 2, 9]);
  });

  test('无搜索数据时等于全量（不漂移）', () => {
    expect(
      mergeLiveEnabledIds({ ...base, searchIds: [], searchUpdatedAt: 0 }),
    ).toEqual([1, 2]);
  });
});

describe('extractEnabledRoleIds（r20-1 搜索证据预过滤）', () => {
  test('只保留 role.enabled === true，enabled=false/null 全部滤掉', () => {
    const roles = [
      role(1),
      role(9, { enabled: false }),
      role(10, { enabled: null }),
    ];
    expect(extractEnabledRoleIds(roles)).toEqual([1]);
  });

  test('空列表返回空数组', () => {
    expect(extractEnabledRoleIds([])).toEqual([]);
  });
});

describe('r20-1 回归：LIKE-OR 漏入的禁用角色不污染正向启用证据', () => {
  // run202-codex-pi-P5-r20-1 实证复现：弹窗打开时全量先落数据（t=2000），
  // 随后的每次常规搜索都必然 searchUpdatedAt > fullUpdatedAt，时效判据恒
  // 放行——单独靠它挡不住后端 like-or 缺括号漏进搜索结果的名称命中禁用角色。
  test('更新的搜索返回 enabled=false 的角色：不得并入合并结果', () => {
    // 全量 [1,2]@2000；搜索返回 [{id:9, enabled:false}]@4000（LIKE-OR 漏入）
    const searchRoles = [role(9, { enabled: false })];
    const merged = mergeLiveEnabledIds({
      fullIds: [1, 2],
      fullHasData: true,
      fullUpdatedAt: 2000,
      searchIds: extractEnabledRoleIds(searchRoles),
      searchUpdatedAt: 4000,
    });
    expect(merged).toEqual([1, 2]);
  });

  test('staleAssignedRoles 仍能把"当前已禁用"角色标出来', () => {
    // 同上场景：搜索证据被过滤后，liveEnabledIds=[1,2]，已分配的禁用角色 9
    // 应出现在"当前已禁用"提示中
    const current = [role(1), role(9, { enabled: false })];
    const liveEnabledIds = mergeLiveEnabledIds({
      fullIds: [1, 2],
      fullHasData: true,
      fullUpdatedAt: 2000,
      searchIds: extractEnabledRoleIds([role(9, { enabled: false })]),
      searchUpdatedAt: 4000,
    });
    expect(extractRoleIds(staleAssignedRoles(current, [1, 2], liveEnabledIds))).toEqual([9]);
  });

  test('更新的搜索返回 enabled=true 的角色：仍按时效判据并入（不过滤）', () => {
    const searchRoles = [role(9, { enabled: true })];
    const merged = mergeLiveEnabledIds({
      fullIds: [1, 2],
      fullHasData: true,
      fullUpdatedAt: 2000,
      searchIds: extractEnabledRoleIds(searchRoles),
      searchUpdatedAt: 4000,
    });
    expect(merged).toEqual([1, 2, 9]);
  });
});
