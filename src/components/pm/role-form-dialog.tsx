/**
 * 角色新建/编辑弹窗（P5：p5-role-list）。
 *
 * - 新建模式（roleId=null）：字段 roleName（必填）/roleCode（必填且唯一）/
 *   description/enabled 开关（默认启用）；提交走 POST /role/v1/createRole。
 * - 编辑模式（roleId=数字）：先 GET /role/v1/findById/{id} 回填；提交走
 *   POST /role/v1/updateRole（全量发送；注意 description 的"清空"语义：
 *   空字符串=显式清空，null=后端跳过不更新，见 role-form.ts）。
 * - 表单 UX 约定：useUnsavedChangesGuard（dirty=当前值 vs 初始快照比较）、
 *   RequiredMark 必填星号、FieldError 字段级错误（收集全部错误、编辑即清该字段错误）。
 * - 角色编码唯一性：后端无应用层检查，提交前用 GET /role/v1/list?keyword=
 *   预检；该端点有 LIKE-OR 缺括号 bug（backend-memo-p5.md §5），预检必须按
 *   roleCode 精确匹配（isRoleCodeTaken），不能只看返回非空；编辑模式排除自身。
 * - 并发防护沿用 user-form-dialog 的机制（会话守卫 + 提交前版本校验 + 变基）：
 *   详情查询 key 用 list({kind:'roleDetail'}) 命名空间，避免与用户详情撞 key。
 */
import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Spinner, Switch, TextField } from "@heroui/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppModal,
  FieldError,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import type { RoleResponse } from "@/lib/api/system-types";
import { systemApi } from "@/lib/api/system";
import {
  buildRoleCreatePayload,
  buildRoleUpdatePayload,
  decideRoleSubmitFailure,
  emptyRoleFormInput,
  isRoleCodeTaken,
  rebaseRoleFormOnVersionConflict,
  roleFormInputFromResponse,
  validateRoleFormInput,
  type RoleFormInput,
} from "@/lib/role-form";
import {
  decideSubmitProceed,
  decideUserDetailRefill,
  SubmitSessionGuard,
} from "@/lib/user-form";
import {
  queryKeys,
  toUserMessage,
  useCreateRole,
  useRoleDetail,
  useUpdateRole,
} from "@/lib/query";

export function RoleFormDialog({
  open,
  roleId,
  onClose,
}: {
  open: boolean;
  /** null=新建；数字=编辑该角色 */
  roleId: number | null;
  onClose: () => void;
}) {
  const isCreate = roleId == null;
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const submitting = createRole.isPending || updateRole.isPending;

  const detail = useRoleDetail(isCreate ? null : roleId, open && !isCreate);
  const queryClient = useQueryClient();
  // 编辑模式的详情查询 key：版本比较一律走 query 缓存实时读取。
  // 命名空间见 useRoles.ts 注释：不用 detail(id)，避免与用户详情撞 key。
  const detailQueryKey =
    isCreate || roleId == null
      ? null
      : queryKeys.system.list({ kind: "roleDetail", roleId });

  const [form, setForm] = useState<RoleFormInput>(emptyRoleFormInput());
  // form 的实时镜像：提交载荷的唯一真相源（语义同 user-form-dialog 的 formRef）。
  const formRef = useRef(form);
  formRef.current = form;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  // 提交失败的后端契约（实读确认，backend-ro 只读研读）：
  // RoleServiceImpl.createRole/updateRole 走 EntityCreator/EntityUpdater 且未注入
  // 自定义 errorHook，默认 errorHook 把 insert/update 失败包装为
  // BusinessException(CodeEnum.SaveError=10002 / UpdateError=10003)（HTTP 400）；
  // 10002/10003 是"保存/更新失败"大类码，后端未解析唯一约束字段，不能断言一定
  // 是 role_code 冲突——挂字段的措辞必须谨慎（见 role-form.ts
  // decideRoleSubmitFailure）。10112 = AuthErrorEnum.RequestFail，只是
  // GlobalExceptionHandler 对 RuntimeException 的兜底码（HTTP 500，如 DB
  // 连接故障），绝不代表编码冲突：绝不能把它标为"编码已存在"或清掉整体失败说明。
  // 唯一性预检在途中：mutation 的 isPending 覆盖不到这段 await，单独置位。
  const [prechecking, setPrechecking] = useState(false);
  const busy = submitting || prechecking;
  // 详情重取的实时状态：handleSubmit 入口与预检返回后的复检都同步读 query
  // 缓存的 fetchStatus（isRefetching 是上次 render 的快照，不足以覆盖"预检
  // 在途期间才启动重取"的情况；见 user-form-dialog 的 readDetailFetching）。
  const readDetailVersion = (): number | null => {
    if (detailQueryKey == null) return null;
    return queryClient.getQueryState(detailQueryKey)?.dataUpdatedAt ?? null;
  };
  const readDetailFetching = (): boolean =>
    !isCreate &&
    detailQueryKey != null &&
    queryClient.getQueryState(detailQueryKey)?.fetchStatus === "fetching";
  const detailSyncing = !isCreate && detail.isRefetching;

  // 提交会话守卫：预检/mutation 的 await 返回后校验令牌，过期则静默丢弃。
  const sessionGuardRef = useRef<SubmitSessionGuard | null>(null);
  if (sessionGuardRef.current === null) {
    sessionGuardRef.current = new SubmitSessionGuard();
  }
  const sessionGuard = sessionGuardRef.current;
  useEffect(() => () => sessionGuard.invalidate(), [sessionGuard]);

  // 初始快照：新建=空表单；编辑=详情到达后一次性快照。
  const initialRef = useRef<string | null>(null);
  const initializedForRef = useRef<number | null>(null);
  const loadedVersionRef = useRef<number | null>(null);
  // 当前表单基线对应的详情数据版本（语义同 user-form-dialog 的 initialVersionRef）。
  const initialVersionRef = useRef<number | null>(null);
  if (isCreate && initialRef.current === null) {
    initialRef.current = JSON.stringify(emptyRoleFormInput());
  }
  useEffect(() => {
    if (isCreate || !detail.data) return;
    const decision = decideUserDetailRefill({
      initialized: initializedForRef.current === roleId,
      versionChanged: loadedVersionRef.current !== detail.dataUpdatedAt,
      // 比较用 formRef 镜像而非 render 的 form（回填排队的 setForm 可能尚未
      // flush；见 user-form-dialog 的 r12-3 注释）。
      formMatchesInitial:
        initialRef.current !== null &&
        JSON.stringify(formRef.current) === initialRef.current,
    });
    if (decision === "noop") return;
    const next = roleFormInputFromResponse(detail.data);
    loadedVersionRef.current = detail.dataUpdatedAt;
    if (decision === "initialize" || decision === "refill") {
      initializedForRef.current = roleId;
      initialRef.current = JSON.stringify(next);
      initialVersionRef.current = detail.dataUpdatedAt;
      formRef.current = next;
      setForm(next);
      setFieldErrors({});
      setSubmitError("");
      if (decision === "refill") {
        toast.info("角色信息已有更新，表单已同步最新，请复核");
      }
    } else {
      // warn-keep：用户已改动表单，不静默覆盖，只提示复核
      toast.warning("角色信息在后台有更新，但你已修改表单，请复核后再保存");
    }
  }, [isCreate, detail.data, detail.dataUpdatedAt, roleId, form]);

  const set = (patch: Partial<RoleFormInput>) => {
    // formRef 是提交载荷的唯一真相源，用户键入必须同步推进镜像
    //（见 user-form-dialog 的 r13-1 注释）。
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
    sessionGuard.invalidate();
    setPrechecking(false);
    setForm(emptyRoleFormInput());
    setFieldErrors({});
    setSubmitError("");
    initialRef.current = null;
    initializedForRef.current = null;
    loadedVersionRef.current = null;
    initialVersionRef.current = null;
    onClose();
  };

  const close = () => {
    // 请求进行中不允许关闭（语义同 user-form-dialog）。
    if (busy) return;
    navGuard(doClose);
  };

  const handleSubmit = async () => {
    if (busy) return;
    if (readDetailFetching()) {
      toast.info("正在同步最新角色信息，请稍候再提交");
      return;
    }
    // 收集全部错误，不首错即停；校验对象与提交载荷同源（formRef.current）。
    const errors = validateRoleFormInput(formRef.current);
    if (errors.length > 0) {
      setFieldErrors(Object.fromEntries(errors.map((e) => [e.field, e.message])));
      return;
    }
    setFieldErrors({});
    setSubmitError("");

    const session = sessionGuard.begin();
    const snapshot = formRef.current;
    const submittedVersion = initialVersionRef.current;
    const roleCode = snapshot.roleCode.trim();
    const stale = () => !sessionGuard.isCurrent(session);

    // 角色编码唯一性预检：list?keyword= 是 LIKE 匹配（且有缺括号 bug），
    // 必须客户端按 roleCode 精确过滤；编辑模式排除自身。
    setPrechecking(true);
    try {
      const candidates = await systemApi.role.list(roleCode);
      if (stale()) return;
      if (isRoleCodeTaken(candidates, roleCode, roleId)) {
        setFieldErrors({ roleCode: "角色编码已存在" });
        return;
      }
    } catch (error) {
      if (stale()) return;
      setSubmitError(`角色编码唯一性预检失败：${toUserMessage(error)}`);
      return;
    } finally {
      if (!stale()) setPrechecking(false);
    }

    // 预检在途期间启动的详情重取可能仍在途：此时缓存版本尚未推进，
    // 版本比较会误放行，而重取随后完成会把旧快照覆盖新数据——该窗口在
    // POST 发出前可拦截（见 user-form-dialog 的 r12-2 注释）。
    if (readDetailFetching()) {
      toast.info("正在同步最新角色信息，请稍候再提交");
      return;
    }

    // 发 mutation 请求前验版本：预检在途期间后台重取若成功，回填 effect 已
    // 把 loadedVersionRef 推进到新版本，此时继续提交旧快照会用旧数据覆盖新
    // 数据（r10 真问题）。中止本次提交：prechecking 已释放，不关闭弹窗、
    // 不丢弃表单新值。
    const proceedDecision = decideSubmitProceed({
      sessionStale: stale(),
      submittedVersion,
      currentVersion: readDetailVersion(),
    });
    if (proceedDecision === "abort-detail-version-changed") {
      // 变基：用户改过的字段保留，未改动的字段同步为服务端最新；dirty 基线
      // 重置为服务端快照（语义同 user-form-dialog 的 r11-2 注释）。
      if (roleId != null && detailQueryKey != null) {
        const latest = queryClient.getQueryData<RoleResponse>(detailQueryKey);
        const latestVersion = readDetailVersion();
        if (latest && latestVersion != null) {
          const serverForm = roleFormInputFromResponse(latest);
          const rebased = rebaseRoleFormOnVersionConflict({
            baseline:
              initialRef.current != null
                ? (JSON.parse(initialRef.current) as RoleFormInput)
                : null,
            current: formRef.current,
            server: serverForm,
          });
          loadedVersionRef.current = latestVersion;
          initialVersionRef.current = latestVersion;
          initializedForRef.current = roleId;
          initialRef.current = JSON.stringify(serverForm);
          if (JSON.stringify(rebased) !== JSON.stringify(formRef.current)) {
            formRef.current = rebased;
            setForm(rebased);
          }
          setFieldErrors({});
          setSubmitError("");
          toast.info(
            "角色信息已有更新：你修改的字段已保留，其余已同步为最新，请复核后重新提交",
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
        const id = await createRole.mutateAsync(buildRoleCreatePayload(snapshot));
        if (stale()) return;
        toast.success(`角色已创建（#${id}）`);
      } else {
        await updateRole.mutateAsync(buildRoleUpdatePayload(roleId, snapshot));
        if (stale()) return;
        toast.success("角色已更新");
      }
      // 成功=已授权离开：先 markClean 再程序化关闭，避免守卫拦截
      markClean();
      doClose();
    } catch (error) {
      if (stale()) return;
      // 提交失败落点：错误码判定抽为纯函数 decideRoleSubmitFailure（role-form.ts）。
      const decision = decideRoleSubmitFailure(error, isCreate);
      // 可识别的"可能的编码冲突"（10002/10003）：写入 fieldErrors.roleCode，
      // 编码输入下方直接提示；用户编辑 roleCode 时 set() 自动清除该错误（编辑即清）。
      // 未知失败（10112 等）：中性字段提示 + 保留整体 submitError，真实失败不隐藏。
      setFieldErrors({ roleCode: decision.roleCodeError });
      if (decision.clearOverall) {
        setSubmitError("");
      } else if (decision.overallError !== null) {
        setSubmitError(decision.overallError);
      }
    }
  };

  const title = isCreate ? "新增角色" : "编辑角色";

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
            正在加载角色信息…
          </div>
        ) : !isCreate && detail.isError ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p className="text-sm text-danger">
              加载失败：{toUserMessage(detail.error, "加载角色信息失败")}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <TextField
                  value={form.roleName}
                  onChange={(next) => set({ roleName: next })}
                  isDisabled={busy}
                  aria-label="角色名称"
                >
                  <Label>
                    角色名称<RequiredMark />
                  </Label>
                  <Input placeholder="如：项目管理员" maxLength={50} />
                </TextField>
                <FieldError message={fieldErrors.roleName} />
              </div>
              <div>
                <TextField
                  value={form.roleCode}
                  onChange={(next) => set({ roleCode: next })}
                  isDisabled={busy}
                  aria-label="角色编码"
                >
                  <Label>
                    角色编码<RequiredMark />
                  </Label>
                  <Input placeholder="如：PROJECT_MANAGER" maxLength={50} />
                </TextField>
                <FieldError message={fieldErrors.roleCode} />
              </div>
            </div>

            <div>
              <TextField
                value={form.description}
                onChange={(next) => set({ description: next })}
                isDisabled={busy}
                aria-label="角色描述"
              >
                <Label>角色描述</Label>
                <Input placeholder="角色用途说明（可选）" maxLength={200} />
              </TextField>
              <FieldError message={fieldErrors.description} />
            </div>

            <div>
              {/*
                HeroUI 3.2.6 的 Switch.Content 才是可点击的 SwitchButton 标签
                （包住 control + 文字），Switch.Control 只是无事件的 span：
                Control 与文字必须共同放进 Content，否则点滑块无反应、只有
                点文字才能切换（run213-codex-P5-r24-3）。
              */}
              <Switch
                isSelected={form.enabled}
                onChange={(next) => set({ enabled: next })}
                isDisabled={busy}
                aria-label="是否启用"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  启用该角色
                </Switch.Content>
              </Switch>
              <FieldError message={fieldErrors.enabled} />
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
