import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import type { MenuResponse } from "@/lib/api/system-types";
import {
  buildMenuCreatePayload,
  buildMenuUpdatePayload,
  emptyMenuFormInput,
  MENU_TYPES,
  MENU_OPEN_TYPES,
  menuFormInputFromResponse,
  menuFormSnapshot,
  parseMenuSelection,
  rebaseMenuFormOnVersionConflict,
  validateMenuFormInput,
  type MenuFormInput,
} from "@/lib/menu-form";
import { isMenuId, menuParentOptions, type MenuTreeData } from "@/lib/menu-tree";
import { decideUserDetailRefill, SubmitSessionGuard } from "@/lib/user-form";
import { queryKeys, toUserMessage, useCreateMenu, useMenuDetail, useUpdateMenu } from "@/lib/query";
import { MenuParentSelect } from "./menu-parent-select";

/** Kept mounted: stale detail/submission results cannot alter a later editing session. */
export function MenuFormDialog({
  open,
  menuId,
  tree,
  records,
  parentsReady,
  onClose,
}: {
  open: boolean;
  menuId: number | null;
  tree: MenuTreeData;
  records: MenuResponse[];
  parentsReady: boolean;
  onClose: () => void;
}) {
  const isCreate = menuId === null;
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const create = useCreateMenu();
  const update = useUpdateMenu();
  const detail = useMenuDetail(menuId, open && !isCreate);
  const client = useQueryClient();
  const detailKey = queryKeys.system.list({ kind: "menuDetail", menuId });
  const [form, setForm] = useState<MenuFormInput>(emptyMenuFormInput);
  const current = useRef(form);
  const baseline = useRef<MenuFormInput | null>(null);
  const initialized = useRef<number | null>(null);
  const seenVersion = useRef<number | null>(null);
  const baselineVersion = useRef<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof MenuFormInput, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const busyRef = useRef(false);
  const busy = create.isPending || update.isPending;
  const sessions = useRef(new SubmitSessionGuard()).current;
  const identity = `${open}:${menuId}`;
  const previousIdentity = useRef(identity);
  if (previousIdentity.current !== identity) {
    sessions.invalidate();
    previousIdentity.current = identity;
  }
  useEffect(() => () => sessions.invalidate(), [sessions]);
  useLayoutEffect(() => {
    sessions.invalidate();
    const next = emptyMenuFormInput();
    current.current = next;
    setForm(next);
    baseline.current = open && isCreate ? next : null;
    initialized.current = null;
    seenVersion.current = null;
    baselineVersion.current = null;
    busyRef.current = false;
    setErrors({});
    setSubmitError("");
  }, [open, menuId, isCreate, sessions]);
  useEffect(() => {
    if (!open || isCreate || !detail.data || detail.data.id !== menuId || busyRef.current) return;
    const decision = decideUserDetailRefill({
      initialized: initialized.current === menuId,
      versionChanged: seenVersion.current !== detail.dataUpdatedAt,
      formMatchesInitial:
        baseline.current !== null &&
        menuFormSnapshot(current.current) === menuFormSnapshot(baseline.current),
    });
    if (decision === "noop") return;
    seenVersion.current = detail.dataUpdatedAt;
    if (decision === "warn-keep") {
      toast.warning("菜单信息在后台有更新，但你已修改表单，请复核后再保存");
      return;
    }
    const next = menuFormInputFromResponse(detail.data);
    initialized.current = menuId;
    baseline.current = next;
    baselineVersion.current = detail.dataUpdatedAt;
    current.current = next;
    setForm(next);
    setErrors({});
    setSubmitError("");
  }, [open, isCreate, menuId, detail.data, detail.dataUpdatedAt, form, busy]);
  const set = (patch: Partial<MenuFormInput>) => {
    current.current = { ...current.current, ...patch };
    setForm(current.current);
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch) as (keyof MenuFormInput)[]) delete next[key];
      return next;
    });
  };
  const dirty =
    open &&
    baseline.current !== null &&
    menuFormSnapshot(form) !== menuFormSnapshot(baseline.current);
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(dirty);
  const doClose = () => {
    sessions.invalidate();
    onClose();
  };
  const close = () => {
    if (!busy && !busyRef.current) guard(doClose);
  };
  const ready =
    isCreate || (isMenuId(menuId) && detail.data !== undefined && initialized.current === menuId);
  const options = menuParentOptions(tree, records, menuId);
  const submit = async () => {
    if (!allowed || !ready || busy || busyRef.current || detail.isError) return;
    if (!isCreate && client.getQueryState(detailKey)?.fetchStatus === "fetching") {
      setSubmitError("正在同步菜单详情，请稍候再保存");
      return;
    }
    if (!isCreate && baselineVersion.current !== client.getQueryState(detailKey)?.dataUpdatedAt) {
      const latest = client.getQueryData<MenuResponse>(detailKey);
      if (latest && latest.id === menuId) {
        const server = menuFormInputFromResponse(latest);
        const next = rebaseMenuFormOnVersionConflict(baseline.current, current.current, server);
        baseline.current = server;
        baselineVersion.current = client.getQueryState(detailKey)?.dataUpdatedAt ?? null;
        seenVersion.current = baselineVersion.current;
        current.current = next;
        setForm(next);
      }
      setSubmitError("菜单信息已有更新：保留你修改的字段，其余同步最新，请复核后重新提交");
      return;
    }
    const failures = validateMenuFormInput(
      current.current,
      {
        ready: parentsReady,
        ids: new Set(options.map((option) => Number(option.id))),
      },
      {
        menuId,
        childCount: menuId === null ? 0 : records.filter((record) => record.parentId === menuId).length,
      },
    );
    setErrors(Object.fromEntries(failures.map((failure) => [failure.field, failure.message])));
    if (failures.length) return;
    setSubmitError("");
    busyRef.current = true;
    const session = sessions.begin();
    try {
      if (isCreate) await create.mutateAsync(buildMenuCreatePayload(current.current));
      else await update.mutateAsync(buildMenuUpdatePayload(menuId, current.current));
      if (!sessions.isCurrent(session)) return;
      toast.success(isCreate ? "菜单已创建" : "菜单已更新");
      markClean();
      doClose();
    } catch (error) {
      if (sessions.isCurrent(session)) setSubmitError(toUserMessage(error));
    } finally {
      if (sessions.isCurrent(session)) busyRef.current = false;
    }
  };
  const textField = (field: "name" | "path" | "icon" | "uri" | "permission", label: string) => (
    <div>
      <TextField
        value={form[field]}
        onChange={(value) => set({ [field]: value })}
        isDisabled={busy}
        isRequired={field === "name"}
        aria-label={label}
      >
        <Label>
          {label}
          {field === "name" ? <RequiredMark /> : null}
        </Label>
        <Input aria-required={field === "name"} />
      </TextField>
      <FieldError message={errors[field]} />
    </div>
  );
  return (
    <>
      {blocker}
      {dialog}
      <AppModal open={open} title={isCreate ? "新增菜单" : "编辑菜单"} onClose={close} size="lg">
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
            {isMenuId(menuId) ? "正在加载菜单信息…" : "菜单 ID 无效"}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {textField("name", "菜单名称")}
              <div>
                <div className="mb-1 text-sm">
                  菜单类型
                  <RequiredMark />
                </div>
                <div>
                  <OptionSelect
                    label="菜单类型（必填）"
                    isRequired
                    value={form.type === null ? "" : String(form.type)}
                    options={MENU_TYPES}
                    onChange={(value) => set({ type: parseMenuSelection(value) })}
                    isDisabled={busy}
                  />
                </div>
                <FieldError
                  message={
                    errors.type ||
                    (form.type !== null && ![1, 2, 3].includes(form.type)
                      ? "请选择支持的菜单类型"
                      : undefined)
                  }
                />
              </div>
              <MenuParentSelect
                value={form.parentId}
                options={options}
                ready={parentsReady}
                busy={busy}
                error={errors.parentId}
                onChange={(parentId) => set({ parentId })}
              />
              {textField("path", "路由地址")}
              {textField("icon", "图标标识")}
              <div>
                <div className="mb-1 text-sm">打开方式</div>
                <OptionSelect
                  label="打开方式"
                  value={form.openType === null ? "" : String(form.openType)}
                  options={
                    baseline.current?.openType === null
                      ? [{ id: "", label: "未设置" }, ...MENU_OPEN_TYPES]
                      : MENU_OPEN_TYPES
                  }
                  onChange={(value) => set({ openType: parseMenuSelection(value) })}
                  isDisabled={busy}
                />
                <FieldError
                  message={
                    errors.openType ||
                    (form.openType !== null && ![1, 2, 3].includes(form.openType)
                      ? "请选择支持的打开方式"
                      : undefined)
                  }
                />
              </div>
              {textField("uri", "定位标识")}
              {textField("permission", "权限标识")}
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
                {busy ? "保存中…" : isCreate ? "创建" : "保存"}
              </Button>
            </div>
          </div>
        )}
      </AppModal>
    </>
  );
}
