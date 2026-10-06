import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
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
import { ApiBusinessError } from "@/lib/api/client";
import {
  emptyDictionaryForm,
  dictionaryFormFromResponse,
  rebaseDictionaryFormOntoRefreshed,
  dictionaryFormSnapshot,
  validateDictionaryForm,
  buildDictionaryCreatePayload,
  buildDictionaryUpdatePayload,
  DICTIONARY_VALUE_TYPES,
  type DictionaryFormInput,
  type DictionaryFormErrors,
} from "@/lib/dictionary-form";
import { isDictionaryId } from "@/lib/dictionary-query";
import { SubmitSessionGuard, decideUserDetailRefill } from "@/lib/user-form";
import {
  useCreateDictionary,
  useUpdateDictionary,
  useDictionaryDetail,
  useCheckDictionaryCode,
  queryKeys,
  toUserMessage,
} from "@/lib/query";

/** Kept mounted across openings. All async results belong to an explicit editing session. */
export function DictionaryFormDialog({
  open,
  dictionaryId,
  onClose,
}: {
  open: boolean;
  dictionaryId: number | null;
  onClose: () => void;
}) {
  const isCreate = dictionaryId === null;
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const contextReady = isCreate || isDictionaryId(dictionaryId);
  const create = useCreateDictionary();
  const update = useUpdateDictionary();
  const check = useCheckDictionaryCode();
  const detail = useDictionaryDetail(dictionaryId, open && !isCreate);
  const client = useQueryClient();
  const detailKey = queryKeys.system.list({ kind: "dictionaryDetail", dictionaryId });
  const [form, setForm] = useState(emptyDictionaryForm);
  const current = useRef(form);
  const baseline = useRef<DictionaryFormInput | null>(open && isCreate ? form : null);

  const baselineVersionRef = useRef<number | null>(null);
  const seenVersion = useRef<number | null>(null);
  const [errors, setErrors] = useState<DictionaryFormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [serverWarning, setServerWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const sessions = useRef(new SubmitSessionGuard()).current;
  const identity = `${open}:${dictionaryId}:${allowed}`;
  const previousIdentity = useRef(identity);
  if (previousIdentity.current !== identity) {
    sessions.invalidate();
    previousIdentity.current = identity;
  }
  useEffect(() => () => sessions.invalidate(), [sessions]);
  useLayoutEffect(() => {
    sessions.invalidate();
    const next = emptyDictionaryForm();
    current.current = next;
    setForm(next);
    baseline.current = open && isCreate ? next : null;
    baselineVersionRef.current = null;

    seenVersion.current = null;
    busyRef.current = false;
    setBusy(false);
    setErrors({});
    setSubmitError("");
    setServerWarning("");
  }, [open, dictionaryId, isCreate, sessions]);
  const snapshot = (value: DictionaryFormInput) => dictionaryFormSnapshot(value, isCreate);
  useEffect(() => {
    if (!open || isCreate || !detail.data || !(detail.data.id === dictionaryId) || busyRef.current)
      return;
    const decision = decideUserDetailRefill({
      initialized: baseline.current !== null,
      versionChanged: seenVersion.current !== detail.dataUpdatedAt,
      formMatchesInitial:
        baseline.current !== null && snapshot(current.current) === snapshot(baseline.current),
    });
    if (decision === "noop") return;
    seenVersion.current = detail.dataUpdatedAt;
    if (decision === "warn-keep") {
      setServerWarning("字典信息在后台有更新，已保留草稿，请复核后保存");
      return;
    }
    const next = dictionaryFormFromResponse(detail.data);
    baseline.current = next;
    baselineVersionRef.current = detail.dataUpdatedAt;
    current.current = next;
    setForm(next);
    setErrors({});
    if (decision === "refill") setServerWarning("已同步最新字典信息，请复核");
  }, [open, isCreate, dictionaryId, detail.data, detail.dataUpdatedAt, form, busy]);
  const canReconcile =
    !isCreate &&
    baseline.current !== null &&
    detail.data !== undefined &&
    detail.data.id === dictionaryId &&
    baselineVersionRef.current !== detail.dataUpdatedAt;
  const reconcile = () => {
    if (!canReconcile || busyRef.current || baseline.current === null || detail.data === undefined)
      return;
    const refreshed = dictionaryFormFromResponse(detail.data);
    const rebased = rebaseDictionaryFormOntoRefreshed(current.current, baseline.current, refreshed);
    baseline.current = refreshed;
    baselineVersionRef.current = detail.dataUpdatedAt;
    current.current = rebased;
    setForm(rebased);
    setErrors({});
    setServerWarning("已基于最新数据重新对账，请复核后保存");
  };
  const set = (patch: Partial<DictionaryFormInput>) => {
    current.current = { ...current.current, ...patch };
    setForm(current.current);
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch) as (keyof DictionaryFormInput)[]) delete next[key];
      return next;
    });
  };
  const dirty = open && baseline.current !== null && snapshot(form) !== snapshot(baseline.current);
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
      (baseline.current !== null && detail.data !== undefined && detail.data.id === dictionaryId));
  const submit = async () => {
    if (!allowed || !ready || busyRef.current || (!isCreate && detail.isError)) return;
    const failures = validateDictionaryForm(current.current, isCreate);
    setErrors(failures);
    if (Object.keys(failures).length) return;
    if (!isCreate && client.getQueryState(detailKey)?.fetchStatus === "fetching") {
      setSubmitError("正在同步详情，请稍候再保存");
      return;
    }
    const submitted = { ...current.current };
    const submittedSnapshot = snapshot(submitted);
    const version = client.getQueryState(detailKey)?.dataUpdatedAt;
    const session = sessions.begin();
    busyRef.current = true;
    setBusy(true);
    setSubmitError("");
    const currentSubmission = () =>
      sessions.isCurrent(session) && snapshot(current.current) === submittedSnapshot;
    try {
      if (isCreate) {
        let exists: boolean;
        try {
          exists = await check.mutateAsync(submitted.code.trim());
        } catch {
          if (currentSubmission()) setErrors((e) => ({ ...e, code: "无法确认编码唯一性，请重试" }));
          return;
        }
        if (!currentSubmission()) return;
        if (exists) {
          setErrors((e) => ({ ...e, code: "编码已存在" }));
          return;
        }
      }
      if (!currentSubmission()) return;
      if (
        !isCreate &&
        (client.getQueryState(detailKey)?.dataUpdatedAt !== version ||
          client.getQueryState(detailKey)?.fetchStatus === "fetching")
      ) {
        setSubmitError("详情在预检期间有更新，请复核后重试");
        return;
      }
      if (
        !isCreate &&
        baselineVersionRef.current !== client.getQueryState(detailKey)?.dataUpdatedAt
      ) {
        setSubmitError("字典信息在后台有更新，请复核后重试");
        return;
      }
      if (isCreate) await create.mutateAsync(buildDictionaryCreatePayload(submitted));
      else await update.mutateAsync(buildDictionaryUpdatePayload(dictionaryId!, submitted));
      if (!currentSubmission()) return;
      markClean();
      toast.success(isCreate ? "字典已创建" : "字典已更新");
      doClose();
    } catch (error) {
      if (!currentSubmission()) return;
      const message = toUserMessage(error);
      if (
        error instanceof ApiBusinessError &&
        /(编码|code).*?(已存在|重复)|duplicate.*?(code)/i.test(message)
      )
        setErrors((e) => ({ ...e, code: message }));
      else setSubmitError(message);
    } finally {
      if (sessions.isCurrent(session)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const textField = (field: "code" | "title" | "memo", label: string) => {
    const required = field === "title" || (field === "code" && isCreate);
    return (
      <div>
        <TextField
          value={form[field]}
          onChange={(value) => set({ [field]: value })}
          isDisabled={busy}
          isReadOnly={field === "code" && !isCreate}
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
      <AppModal open={open} title={isCreate ? "新增字典" : "编辑字典"} onClose={close} size="lg">
        {!allowed ? (
          <p>需要系统管理员权限</p>
        ) : !contextReady ? (
          <p role="alert">字典上下文或 ID 无效，禁止提交</p>
        ) : !ready ? (
          <div>
            {detail.isError ? (
              <p role="alert">加载失败：{toUserMessage(detail.error)}</p>
            ) : (
              <p>正在加载字典信息…</p>
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
            {canReconcile ? (
              <Button onPress={reconcile} isDisabled={busy}>
                基于最新数据继续编辑
              </Button>
            ) : null}
            {textField("code", "编码")}
            {textField("title", "名称")}
            <div>
              <div className="mb-1 text-sm">
                数据类型
                <RequiredMark />
              </div>
              <OptionSelect
                label="数据类型（必填）"
                isRequired
                value={form.valueType}
                options={DICTIONARY_VALUE_TYPES}
                onChange={(valueType) => set({ valueType })}
                isDisabled={busy}
              />
              <FieldError message={errors.valueType} />
            </div>
            {textField("memo", "备注")}
            {submitError ? <p role="alert">{submitError}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onPress={close} isDisabled={busy}>
                取消
              </Button>
              <Button
                variant="primary"
                isDisabled={busy || detail.isFetching || detail.isError}
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
