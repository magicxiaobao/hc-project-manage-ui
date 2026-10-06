import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Label, Spinner, Switch, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import type { PermissionResponse } from "@/lib/api/system-types";
import {
  buildPermissionCreatePayload,
  buildPermissionUpdatePayload,
  decidePermissionPrecheckFailure,
  decidePermissionSubmitFailure,
  emptyPermissionFormInput,
  isPermissionCodeTaken,
  PERMISSION_TYPES,
  permissionFormInputFromResponse,
  permissionFormSnapshot,
  rebasePermissionFormOnVersionConflict,
  validatePermissionFormInput,
  type PermissionFormInput,
} from "@/lib/permission-form";
import { decideSubmitProceed, decideUserDetailRefill, SubmitSessionGuard } from "@/lib/user-form";
import {
  fetchPermissionListAll,
  queryKeys,
  toUserMessage,
  useCreatePermission,
  usePermissionDetail,
  useUpdatePermission,
} from "@/lib/query";
import { isPermissionId } from "@/lib/role-permissions";

/** 持续挂载；关闭或换对象使旧预检/提交令牌失效。详情版本保护沿用角色表单。 */
export function PermissionFormDialog({
  open,
  permissionId,
  onClose,
}: {
  open: boolean;
  permissionId: number | null;
  onClose: () => void;
}) {
  const isCreate = permissionId === null;
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const create = useCreatePermission();
  const update = useUpdatePermission();
  const detail = usePermissionDetail(permissionId, open && !isCreate);
  const client = useQueryClient();
  const detailKey = isCreate
    ? null
    : queryKeys.system.list({ kind: "permissionDetail", permissionId });
  const readVersion = () =>
    detailKey === null ? null : (client.getQueryState(detailKey)?.dataUpdatedAt ?? null);
  const readFetching = () =>
    detailKey !== null && client.getQueryState(detailKey)?.fetchStatus === "fetching";
  const [form, setForm] = useState<PermissionFormInput>(emptyPermissionFormInput);
  const formRef = useRef(form);
  const baselineRef = useRef<PermissionFormInput | null>(null);
  const initializedRef = useRef<number | null>(null);
  const loadedVersionRef = useRef<number | null>(null);
  const initialVersionRef = useRef<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof PermissionFormInput, string>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [prechecking, setPrechecking] = useState(false);
  const busyRef = useRef(false);
  const busy = prechecking || create.isPending || update.isPending;
  const sessionGuardRef = useRef(new SubmitSessionGuard());
  const sessionGuard = sessionGuardRef.current;
  const identity = `${open}:${permissionId}`;
  const identityRef = useRef(identity);
  if (identityRef.current !== identity) {
    sessionGuard.invalidate();
    identityRef.current = identity;
  }
  useEffect(() => () => sessionGuard.invalidate(), [sessionGuard]);
  useLayoutEffect(() => {
    sessionGuard.invalidate();
    const next = emptyPermissionFormInput();
    formRef.current = next;
    setForm(next);
    baselineRef.current = isCreate && open ? next : null;
    initializedRef.current = null;
    loadedVersionRef.current = null;
    initialVersionRef.current = null;
    busyRef.current = false;
    setPrechecking(false);
    setFieldErrors({});
    setSubmitError("");
  }, [open, permissionId, isCreate, sessionGuard]);

  useEffect(() => {
    if (!open || isCreate || !detail.data || detail.data.id !== permissionId) return;
    const decision = decideUserDetailRefill({
      initialized: initializedRef.current === permissionId,
      versionChanged: loadedVersionRef.current !== detail.dataUpdatedAt,
      formMatchesInitial:
        baselineRef.current !== null &&
        permissionFormSnapshot(formRef.current) === permissionFormSnapshot(baselineRef.current),
    });
    if (decision === "noop") return;
    loadedVersionRef.current = detail.dataUpdatedAt;
    if (decision === "warn-keep") {
      toast.warning("权限信息在后台有更新，但你已修改表单，请复核后再保存");
      return;
    }
    const next = permissionFormInputFromResponse(detail.data);
    initializedRef.current = permissionId;
    baselineRef.current = next;
    initialVersionRef.current = detail.dataUpdatedAt;
    formRef.current = next;
    setForm(next);
    setFieldErrors({});
    setSubmitError("");
    if (decision === "refill") toast.info("权限信息已有更新，表单已同步最新，请复核");
  }, [open, isCreate, permissionId, detail.data, detail.dataUpdatedAt, form]);

  const set = (patch: Partial<PermissionFormInput>) => {
    formRef.current = { ...formRef.current, ...patch };
    setForm(formRef.current);
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of Object.keys(patch) as (keyof PermissionFormInput)[]) delete next[field];
      return next;
    });
  };
  const dirty =
    baselineRef.current !== null &&
    permissionFormSnapshot(form) !== permissionFormSnapshot(baselineRef.current);
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(open && dirty);
  const doClose = () => {
    sessionGuard.invalidate();
    busyRef.current = false;
    setPrechecking(false);
    const next = emptyPermissionFormInput();
    formRef.current = next;
    setForm(next);
    baselineRef.current = null;
    initializedRef.current = null;
    loadedVersionRef.current = null;
    initialVersionRef.current = null;
    setFieldErrors({});
    setSubmitError("");
    onClose();
  };
  const close = () => {
    if (busy || busyRef.current) return;
    guard(doClose);
  };
  const ready =
    isCreate ||
    (isPermissionId(permissionId) &&
      detail.data !== undefined &&
      initializedRef.current === permissionId);
  const submit = async () => {
    if (!allowed || busy || busyRef.current || !ready || detail.isError) return;
    if (readFetching()) {
      toast.info("正在同步最新权限信息，请稍候再提交");
      return;
    }
    const errors = validatePermissionFormInput(formRef.current);
    setFieldErrors(Object.fromEntries(errors.map((error) => [error.field, error.message])));
    if (errors.length) return;
    setSubmitError("");
    const session = sessionGuard.begin();
    const stale = () => !sessionGuard.isCurrent(session);
    const snapshot = { ...formRef.current };
    const submittedVersion = initialVersionRef.current;
    busyRef.current = true;
    setPrechecking(true);
    try {
      let candidates: PermissionResponse[];
      try {
        candidates = await fetchPermissionListAll();
      } catch (error) {
        if (!stale()) setSubmitError(`权限编码唯一性预检失败：${toUserMessage(error)}`);
        return;
      }
      if (stale()) return;
      if (readFetching()) {
        toast.info("正在同步最新权限信息，请稍候再提交");
        return;
      }
      const proceed = decideSubmitProceed({
        sessionStale: stale(),
        submittedVersion,
        currentVersion: readVersion(),
      });
      if (proceed === "abort-detail-version-changed") {
        const latest =
          detailKey === null ? undefined : client.getQueryData<PermissionResponse>(detailKey);
        if (latest && latest.id === permissionId) {
          const server = permissionFormInputFromResponse(latest);
          const next = rebasePermissionFormOnVersionConflict({
            baseline: baselineRef.current,
            current: formRef.current,
            server,
          });
          baselineRef.current = server;
          initializedRef.current = permissionId;
          loadedVersionRef.current = readVersion();
          initialVersionRef.current = readVersion();
          formRef.current = next;
          setForm(next);
        }
        toast.info("权限信息已有更新：你修改的字段已保留，其余已同步为最新，请复核后重新提交");
        return;
      }
      if (proceed !== "proceed") return;
      if (isPermissionCodeTaken(candidates, snapshot.permissionCode, permissionId)) {
        setFieldErrors({ permissionCode: decidePermissionPrecheckFailure().permissionCodeError });
        return;
      }
      try {
        if (isCreate) {
          const id = await create.mutateAsync(buildPermissionCreatePayload(snapshot));
          if (stale()) return;
          toast.success(`权限点已创建（#${id}）`);
        } else {
          await update.mutateAsync(buildPermissionUpdatePayload(permissionId, snapshot));
          if (stale()) return;
          toast.success("权限点已更新");
        }
        markClean();
        doClose();
      } catch (error) {
        if (stale()) return;
        const decision = decidePermissionSubmitFailure(error, isCreate);
        setFieldErrors({ permissionCode: decision.permissionCodeError });
        setSubmitError(decision.clearOverall ? "" : (decision.overallError ?? ""));
      }
    } finally {
      if (!stale()) {
        busyRef.current = false;
        setPrechecking(false);
      }
    }
  };
  const textField = (
    field: "permissionName" | "permissionCode" | "groupName" | "description",
    label: string,
    required = false,
  ) => (
    <div>
      <TextField
        value={form[field]}
        onChange={(value) => set({ [field]: value })}
        isDisabled={busy}
        aria-label={label}
      >
        <Label>
          {label}
          {required ? <RequiredMark /> : null}
        </Label>
        {field === "description" ? <TextArea rows={3} /> : <Input />}
      </TextField>
      <FieldError message={fieldErrors[field]} />
      {field === "permissionCode" ? (
        <p className="type-meta mt-1">权限编码须全局唯一，禁用后仍占用该编码</p>
      ) : null}
      {field === "groupName" ? <p className="type-meta mt-1">自由填写，空值归为“未分组”</p> : null}
    </div>
  );
  return (
    <>
      {blocker}
      {dialog}
      <AppModal
        open={open}
        title={isCreate ? "新增权限点" : "编辑权限点"}
        onClose={close}
        size="lg"
      >
        {!allowed ? (
          <p>需要系统管理员权限</p>
        ) : !isCreate && detail.isError ? (
          <div className="flex flex-col gap-3 py-6">
            <p role="alert" className="text-danger">
              加载失败：{toUserMessage(detail.error)}
            </p>
            <Button
              isDisabled={detail.isFetching}
              onPress={() => {
                void detail.refetch();
              }}
            >
              重试
            </Button>
          </div>
        ) : !ready ? (
          <div className="flex items-center gap-2 py-6">
            <Spinner size="sm" />
            {isPermissionId(permissionId) ? "正在加载权限信息…" : "权限 ID 无效"}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {textField("permissionName", "权限名称", true)}
              {textField("permissionCode", "权限编码", true)}
              <div>
                <div className="mb-1 text-sm">
                  权限类型
                  <RequiredMark />
                </div>
                <OptionSelect
                  label="权限类型（必填）"
                  value={form.permissionType}
                  options={PERMISSION_TYPES}
                  onChange={(value) => set({ permissionType: value })}
                  isDisabled={busy}
                />
                <FieldError
                  message={
                    fieldErrors.permissionType ||
                    (form.permissionType &&
                    !PERMISSION_TYPES.some((type) => type.id === form.permissionType)
                      ? "请选择支持的权限类型"
                      : undefined)
                  }
                />
              </div>
              {textField("groupName", "所属分组")}
            </div>
            {textField("description", "描述")}
            <div>
              <Switch
                isSelected={form.enabled === true}
                onChange={(value) => set({ enabled: value })}
                isDisabled={busy}
                aria-label="是否启用"
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  启用
                </Switch.Content>
              </Switch>
              {form.enabled === null ? (
                <p className="type-meta">未设置：未操作开关时保留原状态</p>
              ) : null}
              <FieldError message={fieldErrors.enabled} />
            </div>
            {submitError ? (
              <p role="alert" className="text-sm text-danger">
                {submitError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onPress={close} isDisabled={busy}>
                取消
              </Button>
              <Button
                variant="primary"
                isDisabled={busy || detail.isRefetching}
                onPress={() => {
                  void submit();
                }}
              >
                {busy ? "保存中…" : detail.isRefetching ? "同步中…" : isCreate ? "创建" : "保存"}
              </Button>
            </div>
          </div>
        )}
      </AppModal>
    </>
  );
}
