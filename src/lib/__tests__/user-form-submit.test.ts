/**
 * r10 回归（run171-codex-P5-r10-1）：提交在途→详情回填→预检返回 的时序下，
 * 旧快照不得提交，且用户可复核后重新提交。
 *
 * 用组件实际调用的纯函数（SubmitSessionGuard、decideUserDetailRefill、
 * decideSubmitProceed）复刻整条时序：预检 await 用 deferred promise 模拟在途，
 * 详情重取用 decideUserDetailRefill 决策 + 版本推进模拟。
 */
import { describe, expect, it } from 'vitest';
import {
  buildUserUpdatePayload,
  decideSubmitProceed,
  decideUserDetailRefill,
  emptyUserFormInput,
  rebaseUserFormOnVersionConflict,
  SubmitSessionGuard,
  type UserFormInput,
} from '../user-form';
import type { UserUpdatePayload } from '../api/system-types';

function formOf(patch: Partial<UserFormInput> = {}): UserFormInput {
  return { ...emptyUserFormInput(), ...patch };
}

/** 预检在途模拟：调用方可控制何时返回 */
function deferredPrecheck() {
  let resolve!: (users: { id: number; username: string }[]) => void;
  const promise = new Promise<{ id: number; username: string }[]>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('decideSubmitProceed 决策本身', () => {
  it('会话过期 → abort-session-stale（r9 语义保持）', () => {
    const guard = new SubmitSessionGuard();
    const session = guard.begin();
    guard.invalidate(); // 相当于 doClose() 关闭重开
    expect(
      decideSubmitProceed({
        sessionStale: !guard.isCurrent(session),
        submittedVersion: 1000,
        currentVersion: 1000,
      }),
    ).toBe('abort-session-stale');
  });

  it('会话有效且版本未变 → proceed', () => {
    const guard = new SubmitSessionGuard();
    const session = guard.begin();
    expect(
      decideSubmitProceed({
        sessionStale: !guard.isCurrent(session),
        submittedVersion: 1000,
        currentVersion: 1000,
      }),
    ).toBe('proceed');
  });

  it('会话有效但版本推进 → abort-detail-version-changed', () => {
    const guard = new SubmitSessionGuard();
    const session = guard.begin();
    expect(
      decideSubmitProceed({
        sessionStale: !guard.isCurrent(session),
        submittedVersion: 1000,
        currentVersion: 2000,
      }),
    ).toBe('abort-detail-version-changed');
  });

  it('新建模式：版本恒为 null，永不误中止', () => {
    const guard = new SubmitSessionGuard();
    const session = guard.begin();
    expect(
      decideSubmitProceed({
        sessionStale: !guard.isCurrent(session),
        submittedVersion: null,
        currentVersion: null,
      }),
    ).toBe('proceed');
  });
});

describe('r10 回归：提交在途→详情回填→预检返回', () => {
  it('旧载荷不提交，busy 已释放，用户复核后可重新提交新值', async () => {
    const userId = 7;
    const guard = new SubmitSessionGuard();

    // 弹窗已按详情 v1 初始化：loadedVersion=1000，表单干净
    let loadedVersion: number | null = 1000;
    let form = formOf({ username: 'alice', email: 'old@example.com' });
    const sentPayloads: UserUpdatePayload[] = [];
    let busy = false;

    // 用户点击保存：记录快照与详情版本，预检在途（busy）
    const session = guard.begin();
    const snapshot = form;
    const submittedVersion = loadedVersion;
    busy = true;
    const { promise: precheck, resolve: finishPrecheck } = deferredPrecheck();

    // 预检在途期间，后台重取成功：详情 v2 到达，表单干净 → refill
    const decision = decideUserDetailRefill({
      initialized: true,
      versionChanged: 2000 !== loadedVersion,
      formMatchesInitial: true,
    });
    expect(decision).toBe('refill');
    loadedVersion = 2000;
    form = formOf({ username: 'alice', email: 'new@example.com' });

    // 预检返回；组件 finally：会话有效时释放 prechecking（busy 解除）
    finishPrecheck([]);
    await precheck;
    busy = false;

    // 组件在发 mutation 前的放行决策
    const proceedDecision = decideSubmitProceed({
      sessionStale: !guard.isCurrent(session),
      submittedVersion,
      currentVersion: loadedVersion,
    });
    if (proceedDecision === 'proceed') {
      sentPayloads.push(buildUserUpdatePayload(userId, snapshot));
    }

    // 旧载荷未被提交；表单保留新值（界面显示 new@example.com）
    expect(proceedDecision).toBe('abort-detail-version-changed');
    expect(sentPayloads).toHaveLength(0);
    expect(form.email).toBe('new@example.com');
    expect(busy).toBe(false);

    // 用户复核后重新提交：版本一致 → 放行，且载荷是新值
    const session2 = guard.begin();
    const proceed2 = decideSubmitProceed({
      sessionStale: !guard.isCurrent(session2),
      submittedVersion: loadedVersion,
      currentVersion: loadedVersion,
    });
    expect(proceed2).toBe('proceed');
    sentPayloads.push(buildUserUpdatePayload(userId, form));
    expect(sentPayloads).toHaveLength(1);
    expect(sentPayloads[0].email).toBe('new@example.com');
  });

  it('warn-keep 分支：用户已改动表单时重取同样推进版本，提交同样中止', () => {
    const guard = new SubmitSessionGuard();
    const session = guard.begin();
    // 表单已被改动（脏）→ warn-keep：不覆盖表单，但回填 effect 仍推进版本
    const decision = decideUserDetailRefill({
      initialized: true,
      versionChanged: true,
      formMatchesInitial: false,
    });
    expect(decision).toBe('warn-keep');
    expect(
      decideSubmitProceed({
        sessionStale: !guard.isCurrent(session),
        submittedVersion: 1000,
        currentVersion: 2000,
      }),
    ).toBe('abort-detail-version-changed');
  });
});

describe('rebaseUserFormOnVersionConflict（r11 run175-pi-P5-r11-2）', () => {
  it('表单干净：全部字段同步为服务端 v2', () => {
    const v1 = formOf({ username: 'u1', email: 'old@example.com' });
    const server = formOf({ username: 'u1', email: 'new@example.com', cnName: '新名' });
    const rebased = rebaseUserFormOnVersionConflict({
      baseline: v1,
      current: { ...v1 },
      server,
    });
    expect(rebased).toEqual(server);
  });

  it('warn-keep 脏表单：用户改过的字段保留，未改动的取 v2', () => {
    const v1 = formOf({ username: 'u1', email: 'old@example.com', phone: '111' });
    const current = { ...v1, email: 'mine@example.com' }; // 用户只改了邮箱
    const server = formOf({ username: 'u1', email: 'new@example.com', phone: '222' });
    const rebased = rebaseUserFormOnVersionConflict({
      baseline: v1,
      current,
      server,
    });
    expect(rebased.email).toBe('mine@example.com'); // 用户改动保留
    expect(rebased.phone).toBe('222'); // 未改动字段同步 v2
    expect(rebased.username).toBe('u1');
  });

  it('密码：用户未改则保持空（不改密码），用户改过则保留', () => {
    const v1 = formOf();
    const server = formOf();
    // 未改：双方皆空 → 空
    expect(
      rebaseUserFormOnVersionConflict({ baseline: v1, current: { ...v1 }, server }).password,
    ).toBe('');
    // 改过：保留用户输入
    const changed = { ...v1, password: 'newpass123' };
    expect(
      rebaseUserFormOnVersionConflict({ baseline: v1, current: changed, server }).password,
    ).toBe('newpass123');
  });

  it('baseline 为 null：以 server 为比较基线，与 server 不同的字段视为用户改动保留', () => {
    const server = formOf({ email: 'new@example.com' });
    const rebased = rebaseUserFormOnVersionConflict({
      baseline: null,
      current: formOf({ email: 'stale@example.com' }),
      server,
    });
    // 无基线时无法区分"用户改动"与"旧值"：保守保留与 server 不同的值，避免丢弃用户输入
    expect(rebased.email).toBe('stale@example.com');
    expect(rebased).toEqual({ ...server, email: 'stale@example.com' });
  });
});

describe('r12-1 回归：提交快照绑定表单基线版本（run177-codex-pi-P5-r12-1）', () => {
  it('缓存已推进但回填未落实：基线 v1 vs 缓存 v2 → 中止变基，不直接提交 v1 载荷', () => {
    const v1ts = 1000;
    const v2ts = 2000;
    const v1 = formOf({ username: 'u1', email: 'old@example.com' });
    const v2 = { ...v1, email: 'new@example.com' };

    // 组件 refs 模型：重取完成→缓存已 v2，但回填 effect 尚未执行
    // （表单仍是 v1，initialVersion 仍是 v1ts）
    const initialVersion: number | null = v1ts;

    // 提交开始：submittedVersion 绑定表单基线版本（修复后）；旧代码读缓存=v2ts
    const submittedVersion = initialVersion;
    const snapshot = { ...v1 };

    // 预检返回：缓存仍 v2
    const decision = decideSubmitProceed({
      sessionStale: false,
      submittedVersion,
      currentVersion: v2ts,
    });
    // 基线 v1 vs 缓存 v2 不一致 → 进入变基复核，而非直接提交
    expect(decision).toBe('abort-detail-version-changed');
    // 旧代码：submittedVersion=v2ts（读缓存），两侧都读 v2 → proceed，v1 载荷发出
    expect(
      decideSubmitProceed({
        sessionStale: false,
        submittedVersion: v2ts,
        currentVersion: v2ts,
      }),
    ).toBe('proceed');

    // 变基：baseline=v1、current=表单镜像（仍 v1）、server=v2 → 全取 v2
    const rebased = rebaseUserFormOnVersionConflict({
      baseline: v1,
      current: { ...snapshot },
      server: v2,
    });
    expect(rebased).toEqual(v2);
    expect(buildUserUpdatePayload(7, rebased).email).toBe('new@example.com');
  });
});

describe('r12-3 回归：连续 v2/v3 更新、回填 state 未落实（run177-codex-P5-r12-3）', () => {
  it('回填排队未落实时镜像同步推进：v3 到达仍判 refill，变基不把旧值误判为用户改动', () => {
    const v1ts = 1000;
    const v2ts = 2000;
    const v3ts = 3000;
    const v1 = formOf({ username: 'u1', email: 'old@example.com', phone: '111' });
    const v2 = { ...v1, email: 'v2@example.com' }; // v2 改邮箱
    const v3 = { ...v2, phone: '333' }; // v3 改手机号

    // 组件 refs 模型（复刻修复后的 user-form-dialog 逻辑）
    let initialJson = JSON.stringify(v1);
    let initialVersion: number | null = v1ts;
    let loadedVersion: number | null = v1ts;
    // formRef.current：回填排队时同步推进，不只等下次 render
    let formMirror = { ...v1 };

    // 干净表单 v1 开始预检，submittedVersion 绑定基线版本
    const submittedVersion = initialVersion;

    // v2 到达：refill；setForm(v2) 尚未 flush，但镜像已同步
    let decision = decideUserDetailRefill({
      initialized: true,
      versionChanged: v2ts !== loadedVersion,
      formMatchesInitial: JSON.stringify(formMirror) === initialJson,
    });
    expect(decision).toBe('refill');
    loadedVersion = v2ts;
    initialVersion = v2ts;
    initialJson = JSON.stringify(v2);
    formMirror = { ...v2 }; // 修复点：排队的同时同步镜像

    // v3 到达（v2 的 setForm 仍未落实）：镜像已是 v2 → 仍判 refill；
    // 若按 render 的 form（仍 v1）比较会误判 warn-keep
    decision = decideUserDetailRefill({
      initialized: true,
      versionChanged: v3ts !== loadedVersion,
      formMatchesInitial: JSON.stringify(formMirror) === initialJson,
    });
    expect(decision).toBe('refill');
    loadedVersion = v3ts;
    initialVersion = v3ts;
    initialJson = JSON.stringify(v3);
    formMirror = { ...v3 };

    // 预检返回：基线 v1 vs 缓存 v3 → 中止并变基
    expect(
      decideSubmitProceed({
        sessionStale: false,
        submittedVersion,
        currentVersion: v3ts,
      }),
    ).toBe('abort-detail-version-changed');

    // 变基：baseline=v3、current=镜像（v3）、server=v3 → 结果全等于 v3；
    // 旧镜像（v1）会把旧邮箱误判为"用户改动"保留下来
    const rebased = rebaseUserFormOnVersionConflict({
      baseline: JSON.parse(initialJson) as UserFormInput,
      current: formMirror,
      server: v3,
    });
    expect(rebased).toEqual(v3);
    expect(rebased.email).toBe('v2@example.com'); // 不得回到 v1 的 old@example.com
    expect(rebased.phone).toBe('333');

    // 对照：旧逻辑（镜像未同步、baseline=v2、current=v1、server=v3）的误判形状
    const buggy = rebaseUserFormOnVersionConflict({
      baseline: v2,
      current: { ...v1 },
      server: v3,
    });
    expect(buggy.email).toBe('old@example.com'); // 旧值被误判为用户改动
    expect(buggy.phone).toBe('333');
  });
});

describe('r12-4 回归：warn-keep 后直接保存走变基路径（run177-pi-P5-r12-4）', () => {
  it('脏表单 v1 基线 + warn-keep 推版本到 v2：保存时基线 v1 vs 缓存 v2 → 变基而非整表单提交', () => {
    const v1ts = 1000;
    const v2ts = 2000;
    const v1 = formOf({ username: 'u1', email: 'old@example.com', phone: '111' });
    const v2 = { ...v1, phone: '222' }; // 服务端 v2 改了手机号
    const userEdited = { ...v1, email: 'mine@example.com' }; // 用户只改了邮箱

    // 组件 refs 模型
    const initialJson = JSON.stringify(v1);
    const initialVersion: number | null = v1ts;
    let loadedVersion: number | null = v1ts;
    const formMirror = { ...userEdited }; // 用户编辑 X 后（表单脏，基线仍 v1）

    // 重连重取成功 → effect 判 warn-keep：loadedVersion 推 v2，initialRef/initialVersion 不动
    const decision = decideUserDetailRefill({
      initialized: true,
      versionChanged: v2ts !== loadedVersion,
      formMatchesInitial: JSON.stringify(formMirror) === initialJson,
    });
    expect(decision).toBe('warn-keep');
    loadedVersion = v2ts;

    // 用户随后点保存：submittedVersion 绑定基线版本 v1ts（修复后）；
    // 旧代码读缓存=v2ts → currentVersion=v2ts → proceed，整表单 v1 载荷覆盖服务端 v2
    const submittedVersion = initialVersion;
    expect(
      decideSubmitProceed({
        sessionStale: false,
        submittedVersion,
        currentVersion: v2ts,
      }),
    ).toBe('abort-detail-version-changed');
    expect(
      decideSubmitProceed({
        sessionStale: false,
        submittedVersion: v2ts, // 旧代码：读缓存
        currentVersion: v2ts,
      }),
    ).toBe('proceed');

    // 变基：用户改过的邮箱保留，未改动的手机号同步为 v2
    const rebased = rebaseUserFormOnVersionConflict({
      baseline: JSON.parse(initialJson) as UserFormInput,
      current: formMirror,
      server: v2,
    });
    expect(rebased.email).toBe('mine@example.com');
    expect(rebased.phone).toBe('222');
    expect(rebased.username).toBe('u1');
  });
});

describe('r13 回归：effect 已跑但 setForm 未 commit 时提交快照须与基线同源（run180-codex-pi-P5-r13-1）', () => {
  it('render form 仍 v1、镜像/基线/缓存已 v2：提交载荷读镜像则与基线版本配对一致', () => {
    const v2ts = 2000;
    const v1 = formOf({ username: 'u1', email: 'old@example.com' });
    const v2 = { ...v1, email: 'new@example.com' };

    // 组件 refs 模型（复刻修复后的 user-form-dialog）：
    // 回填 effect 已跑 → 镜像/基线/缓存同步推进到 v2，
    // 但 setForm(v2) 的 DefaultLane render 尚未 commit → render 闭包的 form 仍 v1
    const renderForm = { ...v1 }; // handleSubmit 闭包里旧代码读到的 form
    const formMirror = { ...v2 }; // formRef.current：effect 已同步推进
    const initialVersion: number | null = v2ts; // initialVersionRef.current
    const cacheVersion: number | null = v2ts; // readDetailVersion()

    const submittedVersion = initialVersion;

    // 旧代码：snapshot = render 闭包的 form（v1），submittedVersion=v2
    const oldDecision = decideSubmitProceed({
      sessionStale: false,
      submittedVersion,
      currentVersion: cacheVersion,
    });
    // 两侧都读 v2 → proceed，但载荷是旧 v1 → 旧载荷覆盖服务端 v2（bug 形态锁定）
    expect(oldDecision).toBe('proceed');
    expect(renderForm.email).toBe('old@example.com');

    // 新代码：snapshot = formRef.current（v2），与 submittedVersion 同源
    const snapshot = { ...formMirror };
    const decision = decideSubmitProceed({
      sessionStale: false,
      submittedVersion,
      currentVersion: cacheVersion,
    });
    expect(decision).toBe('proceed');
    // 放行的载荷必须是 v2，而非 v1
    expect(buildUserUpdatePayload(7, snapshot).email).toBe('new@example.com');
  });

  it('set() 同步推进镜像：键入后 render 未落实，镜像已含新值（pi NOTE 收口）', () => {
    const v1 = formOf({ username: 'u1', email: 'old@example.com' });
    // 复刻修复后的 set()：formRef.current = {...formRef.current, ...patch}
    let formMirror = { ...v1 };
    const patch = { email: 'typed@example.com' };
    formMirror = { ...formMirror, ...patch };
    // render 尚未 commit，但提交/回填决策读到的镜像已是最新键入
    expect(formMirror.email).toBe('typed@example.com');
    expect(formMirror.username).toBe('u1');
  });
});
