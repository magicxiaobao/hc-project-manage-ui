import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@heroui/react";
import { SystemConfigValueField } from "./system-config-value-field";
import {
  AppModal,
  FieldError,
  OptionSelect,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import type {
  SystemConfigResponse,
  SystemConfigCreatePayload,
  SystemConfigUpdatePayload,
} from "@/lib/api/system-types";
import {
  emptySystemConfigForm,
  systemConfigFormFromResponse,
  systemConfigFormSnapshot,
  validateSystemConfigForm,
  buildSystemConfigCreatePayload,
  buildSystemConfigUpdatePayload,
  systemConfigSnapshotsEqual,
  switchSystemConfigType,
  shouldValidateConfigValue,
  configKeyPrecheckError,
  configValuePrecheckError,
  verifySavedConfig,
  verifySavedConfigDetail,
  type SystemConfigFormInput,
  type SystemConfigFormErrors,
} from "@/lib/system-config-form";
import { CONFIG_TYPES, configTypeToWire, isSystemConfigId } from "@/lib/system-config-query";
import { SubmitSessionGuard, decideUserDetailRefill } from "@/lib/user-form";
import {
  useCreateSystemConfig,
  useUpdateSystemConfig,
  useSystemConfigDetail,
  useCheckConfigKey,
  useValidateConfigValue,
  systemConfigByKeyOptions,
  systemConfigDetailOptions,
  queryKeys,
  toUserMessage,
} from "@/lib/query";

/** 跨开关常驻；异步结果只属于当前编辑会话。 */
export function SystemConfigFormDialog({
  open,
  configId,
  onClose,
}: {
  open: boolean;
  configId: number | null;
  onClose: () => void;
}) {
  const isCreate = configId === null;
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const contextReady = isCreate || isSystemConfigId(configId);
  const create = useCreateSystemConfig();
  const update = useUpdateSystemConfig();
  const check = useCheckConfigKey();
  const validate = useValidateConfigValue();
  const detail = useSystemConfigDetail(configId, open && !isCreate);
  const client = useQueryClient();
  const detailKey = queryKeys.system.list({ kind: "systemConfigDetail", configId });
  const [form, setForm] = useState(emptySystemConfigForm);
  const current = useRef(form);
  const baseline = useRef<SystemConfigFormInput | null>(open && isCreate ? form : null);

  const pendingServer = useRef<SystemConfigResponse | null>(null);
  const loadedRow = useRef<SystemConfigResponse | undefined>(undefined);
  const [saved, setSaved] = useState<{
    id: number;
    payload: SystemConfigCreatePayload | SystemConfigUpdatePayload;
    type: string | null;
  } | null>(null);
  const [readError, setReadError] = useState("");
  const seenVersion = useRef<number | null>(null);
  const [errors, setErrors] = useState<SystemConfigFormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [serverWarning, setServerWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const sessions = useRef(new SubmitSessionGuard()).current;
  const identity = `${open}:${configId}:${allowed}`;
  const previousIdentity = useRef(identity);
  if (previousIdentity.current !== identity) {
    sessions.invalidate();
    previousIdentity.current = identity;
  }
  useEffect(() => () => sessions.invalidate(), [sessions]);
  useLayoutEffect(() => {
    sessions.invalidate();
    const next = emptySystemConfigForm();
    current.current = next;
    setForm(next);
    baseline.current = open && isCreate ? next : null;

    seenVersion.current = null;
    loadedRow.current = undefined;
    pendingServer.current = null;
    setSaved(null);
    setReadError("");
    busyRef.current = false;
    setBusy(false);
    setErrors({});
    setSubmitError("");
    setServerWarning("");
  }, [open, configId, isCreate, allowed, sessions]);
  const snapshot = (value: SystemConfigFormInput) => systemConfigFormSnapshot(value);
  useEffect(() => {
    if (
      !open ||
      isCreate ||
      !detail.data ||
      !(detail.data.id === configId) ||
      busyRef.current ||
      saved
    )
      return;
    const decision = decideUserDetailRefill({
      initialized: baseline.current !== null,
      versionChanged: seenVersion.current !== detail.dataUpdatedAt,
      formMatchesInitial:
        baseline.current !== null &&
        systemConfigSnapshotsEqual(snapshot(current.current), snapshot(baseline.current)),
    });
    if (decision === "noop") return;
    if (decision === "warn-keep") {
      pendingServer.current = detail.data;
      setServerWarning("配置信息在后台有更新，已保留全部草稿，请复核后台更新后保存");
      return;
    }
    seenVersion.current = detail.dataUpdatedAt;
    pendingServer.current = null;
    const next = systemConfigFormFromResponse(detail.data);
    baseline.current = next;
    loadedRow.current = detail.data;
    current.current = next;
    setForm(next);
    setErrors({});
    if (decision === "refill") setServerWarning("已同步最新配置信息，请复核");
  }, [open, isCreate, configId, detail.data, detail.dataUpdatedAt, form, busy, saved]);
  const reviewLatest = () => {
    if (
      busyRef.current ||
      saved ||
      !allowed ||
      detail.isFetching ||
      detail.isError ||
      !detail.data ||
      detail.data.id !== configId
    )
      return;
    const server = systemConfigFormFromResponse(detail.data);
    const next = { ...server };
    // 显式复核才变基，保留用户改动，未改字段取最新值，避免整表写回旧字段。
    for (const field of Object.keys(server) as (keyof SystemConfigFormInput)[]) {
      if (current.current[field] !== baseline.current?.[field])
        Object.assign(next, { [field]: current.current[field] });
    }
    baseline.current = server;
    current.current = next;
    loadedRow.current = detail.data;
    seenVersion.current = detail.dataUpdatedAt;
    pendingServer.current = null;
    setForm(next);
    setErrors({});
    setSubmitError("");
    setServerWarning("已同步最新配置，保留用户改动，请复核后保存");
  };
  const set = (patch: Partial<SystemConfigFormInput>) => {
    current.current = { ...current.current, ...patch };
    setForm(current.current);
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch) as (keyof SystemConfigFormInput)[]) delete next[key];
      if ("configKey" in patch || "configType" in patch) delete next.configValue;
      return next;
    });
  };
  const dirty =
    open &&
    baseline.current !== null &&
    !systemConfigSnapshotsEqual(snapshot(form), snapshot(baseline.current));
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(dirty);
  const doClose = () => {
    sessions.invalidate();
    onClose();
  };
  const close = () => {
    if (!busyRef.current) guard(doClose);
  };

  const ready =
    contextReady &&
    (isCreate ||
      (baseline.current !== null && detail.data !== undefined && detail.data.id === configId));
  const readSaved = async (result: NonNullable<typeof saved>, isCurrent: () => boolean) => {
    const row = await client.fetchQuery({
      ...systemConfigByKeyOptions(result.payload.configKey!, true),
      staleTime: 0,
    });
    if (!isCurrent()) return;
    verifySavedConfig(row, result.id, result.payload, result.type);
    if (result.payload.enabled === false) {
      const stored = await client.fetchQuery({
        ...systemConfigDetailOptions(result.id, true),
        staleTime: 0,
      });
      if (isCurrent()) verifySavedConfigDetail(stored, result.id, result.payload, result.type);
    }
  };
  const submit = async () => {
    if (!allowed || !ready || saved || busyRef.current || (!isCreate && detail.isError)) return;
    const failures = validateSystemConfigForm(current.current);
    setErrors(failures);
    if (Object.keys(failures).length) return;
    if (!isCreate && client.getQueryState(detailKey)?.fetchStatus === "fetching") {
      setSubmitError("正在同步详情，请稍候再保存");
      return;
    }
    const submitted = { ...current.current };
    const submittedSnapshot = snapshot(submitted);
    const version = seenVersion.current;
    const source = loadedRow.current;
    if (!isCreate && client.getQueryState(detailKey)?.dataUpdatedAt !== version) {
      setSubmitError("详情已更新，请复核后重试");
      return;
    }
    const session = sessions.begin();
    busyRef.current = true;
    setBusy(true);
    setSubmitError("");
    const currentSubmission = () =>
      sessions.isCurrent(session) &&
      systemConfigSnapshotsEqual(snapshot(current.current), submittedSnapshot);
    try {
      const precheckErrors: SystemConfigFormErrors = {};
      const payload = isCreate
        ? buildSystemConfigCreatePayload(submitted)
        : buildSystemConfigUpdatePayload(configId!, submitted, baseline.current!);
      // 两个预检独立收集错误，拒绝把失败当作 false 放行。
      await Promise.all([
        (async () => {
          if (!isCreate && submitted.configKey.trim() === source?.configKey) return;
          try {
            precheckErrors.configKey = configKeyPrecheckError(
              await check.mutateAsync(submitted.configKey.trim()),
            );
          } catch {
            precheckErrors.configKey = configKeyPrecheckError(undefined, true);
          }
        })(),
        (async () => {
          if (!shouldValidateConfigValue(source, submitted)) return;
          try {
            precheckErrors.configValue = configValuePrecheckError(
              await validate.mutateAsync({
                configKey: submitted.configKey.trim(),
                configValue: payload.configValue!,
              }),
            );
          } catch {
            precheckErrors.configValue = configValuePrecheckError(undefined, true);
          }
        })(),
      ]);
      if (!currentSubmission()) return;
      if (
        !isCreate &&
        (client.getQueryState(detailKey)?.dataUpdatedAt !== version ||
          client.getQueryState(detailKey)?.fetchStatus === "fetching")
      ) {
        setSubmitError("详情在预检期间有更新，请复核后重试");
        return;
      }
      if (Object.values(precheckErrors).some(Boolean)) {
        setErrors(precheckErrors);
        return;
      }
      const id = isCreate
        ? await create.mutateAsync(payload as SystemConfigCreatePayload)
        : (await update.mutateAsync(payload as SystemConfigUpdatePayload), configId!);
      if (!currentSubmission()) return;
      markClean();
      baseline.current = submitted;
      const result = { id, payload, type: payload.configType ?? source?.configType ?? null };
      setSaved(result);
      toast.success(isCreate ? "配置已创建" : "配置已更新");
      try {
        await readSaved(result, currentSubmission);
        if (!currentSubmission()) return;
        doClose();
      } catch (error) {
        if (currentSubmission()) setReadError(`已保存，读取验证失败：${toUserMessage(error)}`);
      }
    } catch (error) {
      if (!currentSubmission()) return;
      setSubmitError(toUserMessage(error));
    } finally {
      if (sessions.isCurrent(session)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const retryRead = async () => {
    if (!saved || busyRef.current || !allowed) return;
    const session = sessions.begin();
    busyRef.current = true;
    setBusy(true);
    try {
      await readSaved(saved, () => sessions.isCurrent(session));
      if (!sessions.isCurrent(session)) return;
      markClean();
      doClose();
    } catch (error) {
      if (sessions.isCurrent(session))
        setReadError(`已保存，读取验证失败：${toUserMessage(error)}`);
    } finally {
      if (sessions.isCurrent(session)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const textField = (field: "name" | "configKey" | "description", label: string) => {
    const required = field !== "description";
    return (
      <div>
        <TextField
          value={form[field]}
          onChange={(value) => set({ [field]: value })}
          isDisabled={busy || !!saved}
          isRequired={required}
          aria-label={label}
        >
          <Label>
            {label}
            {required ? <RequiredMark /> : null}
          </Label>
          <Input aria-required={required} />
        </TextField>
        <FieldError message={errors[field]} />
      </div>
    );
  };
  return (
    <>
      {blocker}
      {dialog}
      <AppModal open={open} title={isCreate ? "新增配置" : "编辑配置"} onClose={close} size="lg">
        {!allowed ? (
          <p>需要系统管理员权限</p>
        ) : !contextReady ? (
          <p role="alert">配置上下文或 ID 无效，禁止提交</p>
        ) : !ready ? (
          <div>
            {detail.isError ? (
              <p role="alert">加载失败：{toUserMessage(detail.error)}</p>
            ) : (
              <p>正在加载配置信息…</p>
            )}
            {detail.isError ? (
              <Button
                isDisabled={detail.isFetching}
                onPress={() => {
                  void detail.refetch();
                }}
              >
                重试
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {detail.isError ? (
              <div>
                <p role="alert">详情重取失败：{toUserMessage(detail.error)}；已保留草稿</p>
                <Button
                  onPress={() => {
                    void detail.refetch();
                  }}
                >
                  重试
                </Button>
              </div>
            ) : null}
            {serverWarning ? <p role="status">{serverWarning}</p> : null}
            {pendingServer.current ? (
              <Button
                isDisabled={busy || detail.isFetching || detail.isError}
                onPress={reviewLatest}
              >
                复核后台更新
              </Button>
            ) : null}
            {textField("configKey", "配置键")}
            {textField("name", "名称")}
            <div>
              <div className="mb-1 text-sm">
                数据类型
                <RequiredMark />
              </div>
              <OptionSelect
                label="数据类型（必填）"
                isRequired
                value={form.configType}
                options={CONFIG_TYPES}
                onChange={(configType) => {
                  const next = switchSystemConfigType(current.current, configType);
                  set({ configType: next.configType, configValue: next.configValue });
                }}
                isDisabled={busy || !!saved}
              />
              {!configTypeToWire(form.configType) ? (
                <p>原始类型：{loadedRow.current?.configType ?? "—"}，请明确选择支持的类型。</p>
              ) : null}
              <FieldError
                message={
                  errors.configType ??
                  (!configTypeToWire(form.configType)
                    ? "类型不支持，请明确选择配置类型"
                    : undefined)
                }
              />
            </div>
            <SystemConfigValueField
              type={form.configType}
              value={form.configValue}
              onChange={(configValue) => set({ configValue })}
              error={errors.configValue}
              disabled={busy || !!saved}
            />
            {textField("description", "描述")}
            <Switch
              aria-label="启用配置"
              isSelected={form.enabled}
              onChange={(enabled) => set({ enabled })}
              isDisabled={busy || !!saved}
            >
              启用配置
            </Switch>
            {loadedRow.current?.enabled === null ? (
              <p>原启用状态未知，请明确确认启用开关。</p>
            ) : null}
            {readError ? (
              <div>
                <p role="alert">{readError}</p>
                <Button
                  isDisabled={busy}
                  onPress={() => {
                    void retryRead();
                  }}
                >
                  重试读取验证
                </Button>
              </div>
            ) : null}
            {submitError ? <p role="alert">{submitError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onPress={close} isDisabled={busy}>
                {saved ? "关闭" : "取消"}
              </Button>
              <Button
                variant="primary"
                isDisabled={busy || !!saved || detail.isFetching || detail.isError}
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
