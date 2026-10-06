/**
 * 用户新建/编辑弹窗（P5：p5-user-form）。
 *
 * - 新建模式（userId=null）：字段 username（必填 3–20 字符）/password（必填 ≥8 位）/
 *   cnName/email/phone/departmentId/positionId/departmentName；提交走
 *   POST /user/v1/createUser，载荷不传 status/enabled/admin/roles/memo。
 * - 编辑模式（userId=数字）：先 GET /user/v1/findById/{id} 回填；password 留空=
 *   不修改（载荷省略 password，后端 updater 忽略 null 字段；绝不传 ""，
 *   否则后端判"密码不能为空"）。
 * - 表单 UX 约定：useUnsavedChangesGuard（dirty=当前值 vs 初始快照比较）、
 *   RequiredMark 必填星号、FieldError 字段级错误（收集全部错误、编辑即清该字段错误）。
 * - 用户名唯一性：后端无应用层检查（DB 唯一约束 → 10112"请求失败"），提交前用
 *   GET /user/v1/list?keyword= 预检并精确匹配；10112 也挂到用户名字段下。
 */
import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppModal,
  FieldError,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { ApiBusinessError } from "@/lib/api/client";
import type { UserResponse } from "@/lib/api/system-types";
import { systemApi } from "@/lib/api/system";
import {
  buildUserCreatePayload,
  buildUserUpdatePayload,
  decideSubmitProceed,
  decideUserDetailRefill,
  emptyUserFormInput,
  isUsernameTaken,
  rebaseUserFormOnVersionConflict,
  SubmitSessionGuard,
  userFormInputFromResponse,
  validateUserFormInput,
  type UserFormInput,
} from "@/lib/user-form";
import {
  queryKeys,
  toUserMessage,
  useCreateUser,
  useUpdateUser,
  useUserDetail,
} from "@/lib/query";

/** 后端重复用户名时的业务码（AuthErrorEnum.RequestFail）：DB 唯一约束触发后
 *  GlobalExceptionHandler 的 RuntimeException 兜底返回此码，无字段信息 */
const DUPLICATE_USERNAME_CODE = 10112;

export function UserFormDialog({
  open,
  userId,
  onClose,
}: {
  open: boolean;
  /** null=新建；数字=编辑该用户 */
  userId: number | null;
  onClose: () => void;
}) {
  const isCreate = userId == null;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const submitting = createUser.isPending || updateUser.isPending;

  const detail = useUserDetail(isCreate ? null : userId, open && !isCreate);
  const queryClient = useQueryClient();
  // 编辑模式的详情查询 key：版本比较一律走 query 缓存实时读取
  const detailQueryKey =
    isCreate || userId == null ? null : queryKeys.system.detail(userId);

  const [form, setForm] = useState<UserFormInput>(emptyUserFormInput());
  // form 的实时镜像：提交载荷的唯一真相源。handleSubmit 的 await 延续闭包里
  // 的 render form 可能落后（回填 effect 排队的 setForm 尚未 commit），而镜像
  // 由所有写表单的路径同步推进（set/回填 effect/变基），与表单基线
  //（initialRef/initialVersionRef）恒一致。提交的载荷、校验、用户名一律读
  // formRef.current——与基线版本取自同一来源，否则"effect 已跑→setForm 未
  // commit→用户点击保存"的窗口里 snapshot=v1 配 submittedVersion=v2，预检
  // 返回后误放行，mutation 发出旧载荷覆盖服务端新数据（回归
  // run180-codex-pi-P5-r13-1）。render 回写仅作兜底（doClose 等直接调
  // setForm 的路径靠它修复镜像）。
  const formRef = useRef(form);
  formRef.current = form;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  // 唯一性预检在途中：mutation 的 isPending 覆盖不到这段 await，单独置位，
  // 与 submitting 合并为 busy 后统一禁用提交入口（防重复提交/旧流程污染）。
  const [prechecking, setPrechecking] = useState(false);
  const busy = submitting || prechecking;
  // 回归 run175-codex-P5-r11-1：版本比较必须同步读 query 缓存的 dataUpdatedAt，
  // 不能依赖回填 effect 推进的 loadedVersionRef——"详情重取完成→Query 缓存已
  // 更新→effect 尚未执行→预检返回"的时序下，ref 仍是旧版本，比较会误放行。
  const readDetailVersion = (): number | null => {
    if (detailQueryKey == null) return null;
    return queryClient.getQueryState(detailQueryKey)?.dataUpdatedAt ?? null;
  };
  // 回归 run175-pi-P5-r11-1：版本比较只覆盖预检窗口；重取在"比较之后、
  // mutation 在途"完成时旧快照仍会覆盖新数据，而前端无法撤回已发出的 POST。
  // 源头方案：详情重取在途时不让用户开始提交，等重取落定、回填 effect 装入
  // 新值后再提交。（比较→mutateAsync 之间本就无 await，无需重复复检。）
  const detailSyncing = !isCreate && detail.isRefetching;
  // 回归 run177-codex-pi-P5-r12-2：详情重取的实时状态。handleSubmit 的入口
  // 检查与预检返回后的复检都必须同步读 query 缓存的 fetchStatus——detail 的
  // isRefetching 是上次 render 的快照，重取可能在预检在途期间才启动，那时
  // 缓存版本尚未推进，版本比较会误放行，而重取随后完成会把旧快照覆盖新数据。
  const readDetailFetching = (): boolean =>
    !isCreate &&
    detailQueryKey != null &&
    queryClient.getQueryState(detailQueryKey)?.fetchStatus === "fetching";

  // 提交会话守卫：预检/mutation 的 await 返回后校验令牌，过期则静默丢弃
  // （弹窗已关闭重开、或已开始新提交），不写入、不关闭新草稿、不挂错误。
  const sessionGuardRef = useRef<SubmitSessionGuard | null>(null);
  if (sessionGuardRef.current === null) {
    sessionGuardRef.current = new SubmitSessionGuard();
  }
  const sessionGuard = sessionGuardRef.current;
  // 卸载（路由导航离开）时同样作废在途会话：doClose 走不到这里，
  // 旧 await 返回后必须按过期令牌丢弃，不再继续 mutation/toast。
  useEffect(() => () => sessionGuard.invalidate(), [sessionGuard]);

  // 初始快照：新建=空表单；编辑=详情到达后一次性快照。
  // dirty 按"当前值 vs 初始快照"判定，不用"非空即脏"。
  const initialRef = useRef<string | null>(null);
  const initializedForRef = useRef<number | null>(null);
  // 已装入表单的详情数据版本（react-query dataUpdatedAt）：后台重取推进版本
  // 后，若表单未被改动则回填最新（旧实现只认首次快照，会拿旧值覆盖新值）。
  const loadedVersionRef = useRef<number | null>(null);
  // 当前表单基线（initialRef）对应的详情数据版本。提交快照必须绑定表单基
  // 线版本，而不能读缓存版本：缓存可能已推进但回填 effect 尚未 flush（表
  // 单仍是旧基线），两侧都读缓存会丢掉"载荷实际基于哪个版本"的校验，直
  // 接提交旧载荷（回归 run177-codex-pi-P5-r12-1）。warn-keep 分支不推进基
  // 线时版本同样保持不动：用户随后直接保存时基线 v1 vs 缓存 v2 不一致，
  // 即走变基路径（回归 run177-pi-P5-r12-4）。
  const initialVersionRef = useRef<number | null>(null);
  if (isCreate && initialRef.current === null) {
    initialRef.current = JSON.stringify(emptyUserFormInput());
  }
  useEffect(() => {
    if (isCreate || !detail.data) return;
    const decision = decideUserDetailRefill({
      initialized: initializedForRef.current === userId,
      versionChanged: loadedVersionRef.current !== detail.dataUpdatedAt,
      formMatchesInitial:
        initialRef.current !== null &&
        // 回归 run177-codex-P5-r12-3：比较用 formRef 镜像而非 render 的
        // form——回填排队的 setForm 可能尚未 flush，render 快照仍是旧表单，
        // 会把"连续 v2/v3 更新"误判为 warn-keep（用户从未改动表单）。
        JSON.stringify(formRef.current) === initialRef.current,
    });
    if (decision === "noop") return;
    const next = userFormInputFromResponse(detail.data);
    loadedVersionRef.current = detail.dataUpdatedAt;
    if (decision === "initialize" || decision === "refill") {
      initializedForRef.current = userId;
      initialRef.current = JSON.stringify(next);
      // 基线版本与新基线同步推进（提交快照绑定此版本，见 r12-1/r12-4）
      initialVersionRef.current = detail.dataUpdatedAt;
      // 回归 run177-codex-P5-r12-3：排队 setForm 的同时同步推进表单镜像。
      // 只依赖下次 render 更新 formRef 的话，"v2 回填排队未落实→v3 到达"的
      // 窗口里镜像仍是旧表单，后续变基会把旧值误判为用户改动写回去。
      formRef.current = next;
      setForm(next);
      setFieldErrors({});
      setSubmitError("");
      if (decision === "refill") {
        toast.info("用户信息已有更新，表单已同步最新，请复核");
      }
    } else {
      // warn-keep：用户已改动表单，不静默覆盖，只提示复核
      toast.warning("用户信息在后台有更新，但你已修改表单，请复核后再保存");
    }
  }, [isCreate, detail.data, detail.dataUpdatedAt, userId, form]);

  const set = (patch: Partial<UserFormInput>) => {
    // 回归 run180-codex-pi-P5-r13-1（pi NOTE 收口）：formRef 是提交载荷的唯一
    // 真相源，用户键入也必须同步推进镜像。若只等 render 回写，"键入→setForm
    // 排队未落实→回填 effect 跑"的窗口里镜像仍是旧值，回填决策会把未落实的
    // 键入误判为"干净"而静默覆盖；提交读取时也会丢掉刚键入的值。函数式
    // setForm 与这里的展开顺序一致（都基于最新待处理状态叠加 patch），收敛。
    formRef.current = { ...formRef.current, ...patch };
    setForm((current) => ({ ...current, ...patch }));
    // 编辑即清除该字段错误
    setFieldErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  };

  const isDirty =
    initialRef.current !== null && JSON.stringify(form) !== initialRef.current;
  // 弹窗打开且脏时布防：拦截浏览器后退/刷新/关标签页
  const { guard: navGuard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    open && isDirty,
  );

  const doClose = () => {
    // 丢弃所有在途旧流程的结果：关闭即开启新会话，之后返回的旧 await
    // 一律按过期令牌静默丢弃（不写入、不关闭新草稿、不挂错误）。
    sessionGuard.invalidate();
    setPrechecking(false);
    setForm(emptyUserFormInput());
    setFieldErrors({});
    setSubmitError("");
    initialRef.current = null;
    initializedForRef.current = null;
    loadedVersionRef.current = null;
    initialVersionRef.current = null;
    onClose();
  };

  const close = () => {
    // 请求进行中不允许关闭：旧请求的回调会重置并关闭重新打开的弹窗，
    // 丢失用户正在填写的新草稿。AppModal 的关闭入口（X/遮罩/Escape）都走这里。
    // busy 覆盖 mutation 与唯一性预检两段在途（预检期 isPending 仍为 false）。
    if (busy) return;
    navGuard(doClose);
  };

  const handleSubmit = async () => {
    if (busy) return;
    // 重取在途不开始提交：见 readDetailFetching 注释。
    // run175-pi-P5-r11-1 要求入口禁用；run177-codex-pi-P5-r12-2 要求改用
    // 实时缓存状态——isRefetching 是上次 render 的快照，不足以覆盖"预检
    // 在途期间才启动重取"的情况。
    if (readDetailFetching()) {
      toast.info("正在同步最新用户信息，请稍候再提交");
      return;
    }
    // 收集全部错误，不首错即停。校验对象与提交载荷必须同源（formRef.current），
    // 不能用 render 闭包的 form：回填 effect 已跑但 setForm 未 commit 时 form
    // 仍是旧值，用它校验等于在校验一个不会被提交的旧表单（回归
    // run180-codex-pi-P5-r13-1）。
    const errors = validateUserFormInput(formRef.current, isCreate);
    if (errors.length > 0) {
      setFieldErrors(Object.fromEntries(errors.map((e) => [e.field, e.message])));
      return;
    }
    setFieldErrors({});
    setSubmitError("");

    // 本次提交的会话令牌 + 输入快照：await 期间用户无法再提交（busy），
    // 但弹窗可能被关闭重开；每次 await 返回后先验令牌，过期直接丢弃。
    const session = sessionGuard.begin();
    // 回归 run180-codex-pi-P5-r13-1：提交快照必须读 formRef.current 而非
    // render 闭包的 form。"回填 effect 已跑（镜像/基线/缓存已 v2）→setForm(v2)
    // 的 DefaultLane render 尚未 commit→用户点击保存"的窗口里，render 的
    // form 仍是 v1 而 initialVersionRef.current 已是 v2；用 form 做 snapshot
    // 会配对出 snapshot=v1 + submittedVersion=v2，预检返回后
    // decideSubmitProceed(v2 vs v2) 误放行，mutation 发出 v1 旧载荷覆盖服务端
    // v2。formRef 由回填 effect 与基线同步推进，读它即与 submittedVersion 同源。
    const snapshot = formRef.current;
    // 提交快照绑定的表单基线版本（回归 run177-codex-pi-P5-r12-1 /
    // run177-pi-P5-r12-4）：必须是 initialRef 对应的版本，不能同步读缓存。
    // 缓存可能已先于回填 effect 推进（表单仍是旧基线），两侧都读缓存会丢
    // 掉"载荷实际基于哪个版本"的校验——预检返回时缓存版本相等就直接提交
    // 旧载荷；warn-keep 后用户直接保存时同样误放行。预检返回时仍同步读缓
    // 存做 currentVersion，不一致即走变基复核。新建模式恒为 null。
    const submittedVersion = initialVersionRef.current;
    const username = snapshot.username.trim();
    const stale = () => !sessionGuard.isCurrent(session);

    // 用户名唯一性预检：list?keyword= 是 LIKE 匹配，必须客户端精确过滤；
    // 编辑模式排除自身
    setPrechecking(true);
    try {
      const candidates = await systemApi.user.list(username);
      if (stale()) return;
      if (isUsernameTaken(candidates, username, userId)) {
        setFieldErrors({ username: "用户名已存在" });
        return;
      }
    } catch (error) {
      if (stale()) return;
      setSubmitError(`用户名唯一性预检失败：${toUserMessage(error)}`);
      return;
    } finally {
      if (!stale()) setPrechecking(false);
    }

    // 回归 run177-codex-pi-P5-r12-2：预检在途期间启动的详情重取可能仍在途。
    // 此时缓存版本尚未推进，版本比较会误放行（v1=v1→mutation 发出），而重取
    // 随后完成会把旧快照覆盖新数据——该窗口在 POST 发出前可拦截，不应归入
    // "需后端乐观锁"的残余风险。prechecking 已在上面 finally 中释放。
    if (readDetailFetching()) {
      toast.info("正在同步最新用户信息，请稍候再提交");
      return;
    }

    // 发 mutation 请求前验版本：预检在途期间后台重取若成功，回填 effect 已
    // 把 loadedVersionRef 推进到新版本，此时继续提交旧快照会用旧数据覆盖新
    // 数据（r10 真问题 run171-codex-P5-r10-1）。中止本次提交：prechecking 已
    // 在上面 finally 中释放（busy 解除，用户可复核后重新提交）；不关闭弹窗、
    // 不丢弃表单新值（回填 effect 已把新值装入表单）。
    const proceedDecision = decideSubmitProceed({
      sessionStale: stale(),
      submittedVersion,
      // 同步读缓存：回填 effect 可能尚未 flush，读 ref 会误放行
      //（run175-codex-P5-r11-1）
      currentVersion: readDetailVersion(),
    });
    if (proceedDecision === "abort-detail-version-changed") {
      // 回归 run175-pi-P5-r11-2：中止不能只提示"请复核"。warn-keep 路径下
      // 表单仍是脏的 v1 基线，用户第二次保存时版本已一致，会直接提交基于
      // v1 的整表单覆盖服务端 v2——中止只拖慢一次。这里把缓存中最新的详情
      // 变基到表单：用户改过的字段保留，未改动的字段同步为 v2；dirty 基线
      // 重置为 v2，重提即基于 v2 提交，用户改动仍显示为脏（守卫继续布防）。
      // prechecking 已在上面 finally 中释放（busy 解除）。
      if (userId != null && detailQueryKey != null) {
        const latest =
          queryClient.getQueryData<UserResponse>(detailQueryKey);
        const latestVersion = readDetailVersion();
        if (latest && latestVersion != null) {
          const serverForm = userFormInputFromResponse(latest);
          const rebased = rebaseUserFormOnVersionConflict({
            baseline:
              initialRef.current != null
                ? (JSON.parse(initialRef.current) as UserFormInput)
                : null,
            current: formRef.current,
            server: serverForm,
          });
          // 抢在待 flush 的回填 effect 之前推进版本：effect 重跑时
          // versionChanged 为 false → noop，不会重复回填/重复 toast。
          loadedVersionRef.current = latestVersion;
          // 基线已重置为服务端快照，基线版本同步推进（r12-1）：后续提交的
          // submittedVersion 即为此版本。
          initialVersionRef.current = latestVersion;
          initializedForRef.current = userId;
          initialRef.current = JSON.stringify(serverForm);
          if (JSON.stringify(rebased) !== JSON.stringify(formRef.current)) {
            // 回归 run177-codex-P5-r12-3：排队 setForm 的同时同步推进表单镜像
            formRef.current = rebased;
            setForm(rebased);
          }
          setFieldErrors({});
          setSubmitError("");
          toast.info(
            "用户信息已有更新：你修改的字段已保留，其余已同步为最新，请复核后重新提交",
          );
          return;
        }
      }
      toast.info("详情已更新，请复核后重新提交");
      return;
    }
    if (proceedDecision !== "proceed") return; // abort-session-stale：静默丢弃

    try {
      if (isCreate) {
        const id = await createUser.mutateAsync(buildUserCreatePayload(snapshot));
        if (stale()) return;
        toast.success(`用户已创建（#${id}）`);
      } else {
        await updateUser.mutateAsync(buildUserUpdatePayload(userId, snapshot));
        if (stale()) return;
        toast.success("用户已更新");
      }
      // 成功=已授权离开：先 markClean 再程序化关闭，避免守卫拦截
      markClean();
      doClose();
    } catch (error) {
      if (stale()) return;
      if (error instanceof ApiBusinessError && error.code === DUPLICATE_USERNAME_CODE) {
        // 10112 是 GlobalExceptionHandler 的 RuntimeException 兜底码，不携带
        // 字段信息：不能断言一定是用户名重复（邮箱超长等其它字段冲突同样落
        // 到此码）。预检已覆盖有效用户名的唯一性，这里只给中性提示。
        setFieldErrors({
          username:
            "提交失败：可能是用户名已存在，也可能是其它字段冲突，请检查后重试",
        });
      } else {
        setSubmitError(`${isCreate ? "创建" : "更新"}失败：${toUserMessage(error)}`);
      }
    }
  };

  const title = isCreate ? "新增用户" : "编辑用户";

  return (
    <>
      {/*
        blocker 必须独立于 AppModal 挂载：弹窗关闭不能卸载一个正在等待用户作答
        的路由拦截，否则那次导航会永远挂起。
      */}
      {blocker}
      <AppModal open={open} title={title} onClose={close} size="lg">
        {dialog}
        {!isCreate && detail.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-default-500">
            <Spinner size="sm" />
            正在加载用户信息…
          </div>
        ) : !isCreate && detail.isError ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p className="text-sm text-danger">
              加载失败：{toUserMessage(detail.error, "加载用户信息失败")}
            </p>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={detail.isRefetching}
              onPress={() => {
                void detail.refetch();
              }}
            >
              重试
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <TextField
                value={form.username}
                onChange={(next) => set({ username: next })}
                isDisabled={busy}
                aria-label="用户名"
              >
                <Label>
                  用户名<RequiredMark />
                </Label>
                <Input placeholder="3–20 个字符" maxLength={20} />
              </TextField>
              <FieldError message={fieldErrors.username} />
            </div>

            <div>
              <TextField
                value={form.password}
                onChange={(next) => set({ password: next })}
                isDisabled={busy}
                aria-label={isCreate ? "密码" : "新密码（留空不修改）"}
              >
                <Label>
                  {isCreate ? (
                    <>
                      密码<RequiredMark />
                    </>
                  ) : (
                    "新密码（留空不修改）"
                  )}
                </Label>
                <Input type="password" placeholder={isCreate ? "至少 8 位" : "留空则不修改密码"} />
              </TextField>
              <FieldError message={fieldErrors.password} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <TextField
                  value={form.cnName}
                  onChange={(next) => set({ cnName: next })}
                  isDisabled={busy}
                  aria-label="姓名"
                >
                  <Label>姓名</Label>
                  <Input placeholder="中文姓名" />
                </TextField>
                <FieldError message={fieldErrors.cnName} />
              </div>
              <div>
                <TextField
                  value={form.email}
                  onChange={(next) => set({ email: next })}
                  isDisabled={busy}
                  aria-label="邮箱"
                >
                  <Label>邮箱</Label>
                  <Input placeholder="name@example.com" />
                </TextField>
                <FieldError message={fieldErrors.email} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <TextField
                  value={form.phone}
                  onChange={(next) => set({ phone: next })}
                  isDisabled={busy}
                  aria-label="手机"
                >
                  <Label>手机</Label>
                  <Input placeholder="手机号码" />
                </TextField>
                <FieldError message={fieldErrors.phone} />
              </div>
              <div>
                <TextField
                  value={form.departmentName}
                  onChange={(next) => set({ departmentName: next })}
                  isDisabled={busy}
                  aria-label="部门名称"
                >
                  <Label>部门名称</Label>
                  <Input placeholder="部门名称" />
                </TextField>
                <FieldError message={fieldErrors.departmentName} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <TextField
                  value={form.departmentIdText}
                  onChange={(next) => set({ departmentIdText: next })}
                  isDisabled={busy}
                  aria-label="部门 ID"
                >
                  <Label>部门 ID</Label>
                  <Input placeholder="正整数，可空" inputMode="numeric" />
                </TextField>
                <FieldError message={fieldErrors.departmentIdText} />
              </div>
              <div>
                <TextField
                  value={form.positionIdText}
                  onChange={(next) => set({ positionIdText: next })}
                  isDisabled={busy}
                  aria-label="岗位 ID"
                >
                  <Label>岗位 ID</Label>
                  <Input placeholder="正整数，可空" inputMode="numeric" />
                </TextField>
                <FieldError message={fieldErrors.positionIdText} />
              </div>
            </div>

            {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onPress={close} isDisabled={busy}>
                取消
              </Button>
              <Button
                variant="primary"
                onPress={() => {
                  void handleSubmit();
                }}
                isDisabled={busy || detailSyncing}
              >
                {detailSyncing
                  ? "同步中…"
                  : busy
                    ? isCreate
                      ? "创建中…"
                      : "保存中…"
                    : isCreate
                      ? "创建"
                      : "保存"}
              </Button>
            </div>
          </div>
        )}
      </AppModal>
    </>
  );
}
