import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { Button, Input, Label, TextField, TextArea } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppModal, FieldError, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import { ApiBusinessError } from "@/lib/api/client";
import type { DictionaryResponse, DictionaryItemResponse } from "@/lib/api/system-types";
import {
  emptyDictionaryItemForm,
  dictionaryItemFormFromResponse,
  dictionaryItemFormSnapshot,
  validateDictionaryItemForm,
  buildDictionaryItemCreatePayload,
  buildDictionaryItemUpdatePayload,
  needsDictionaryItemValueCheck,
  type DictionaryItemFormInput,
  type DictionaryItemFormErrors,
} from "@/lib/dictionary-item-form";
import { isDictionaryId, dictionaryValueTypeLabel } from "@/lib/dictionary-query";
import { SubmitSessionGuard, decideUserDetailRefill } from "@/lib/user-form";
import {
  useCreateDictionaryItem,
  useUpdateDictionaryItem,
  useDictionaryItemDetail,
  useCheckDictionaryItemValue,
  queryKeys,
  toUserMessage,
} from "@/lib/query";

/** Kept mounted across openings. All async results belong to an explicit editing session. */
export function DictionaryItemFormDialog({
  open,
  itemId,
  dictionary,
  onClose,
  exitRef,
}: {
  open: boolean;
  itemId: number | null;
  dictionary: DictionaryResponse | undefined;
  onClose: () => void;
  exitRef?: MutableRefObject<((action: () => void) => void) | null>;
}) {
  const isCreate = itemId === null;
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const dictId = dictionary?.id ?? null;
  const contextReady = isDictionaryId(dictId);
  const create = useCreateDictionaryItem();
  const update = useUpdateDictionaryItem();
  const check = useCheckDictionaryItemValue();
  const detail = useDictionaryItemDetail(itemId, dictId, open && !isCreate);
  const client = useQueryClient();
  const detailKey = queryKeys.system.list({ kind: "dictionaryItemDetail", itemId, dictId });
  const [form, setForm] = useState(emptyDictionaryItemForm);
  const current = useRef(form);
  const baseline = useRef<DictionaryItemFormInput | null>(open && isCreate ? form : null);
  const original = useRef<DictionaryItemResponse | null>(null);
  const seenVersion = useRef<number | null>(null);
  const [errors, setErrors] = useState<DictionaryItemFormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [serverWarning, setServerWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const sessions = useRef(new SubmitSessionGuard()).current;
  const identity = `${open}:${itemId}:${dictId}:${allowed}`;
  const previousIdentity = useRef(identity);
  if (previousIdentity.current !== identity) {
    sessions.invalidate();
    previousIdentity.current = identity;
  }
  useEffect(() => () => sessions.invalidate(), [sessions]);
  useLayoutEffect(() => {
    sessions.invalidate();
    const next = emptyDictionaryItemForm();
    current.current = next;
    setForm(next);
    baseline.current = open && isCreate ? next : null;
    original.current = null;
    seenVersion.current = null;
    busyRef.current = false;
    setBusy(false);
    setErrors({});
    setSubmitError("");
    setServerWarning("");
  }, [open, itemId, dictId, isCreate, sessions]);
  const snapshot = dictionaryItemFormSnapshot;
  useEffect(() => {
    if (
      !open ||
      isCreate ||
      !detail.data ||
      !(detail.data.id === itemId && detail.data.dictId === dictId) ||
      busyRef.current
    )
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
      setServerWarning("字典项信息在后台有更新，已保留草稿，请复核后保存");
      return;
    }
    const next = dictionaryItemFormFromResponse(detail.data);
    baseline.current = next;
    original.current = detail.data;
    current.current = next;
    setForm(next);
    setErrors({});
    if (decision === "refill") setServerWarning("已同步最新字典项信息，请复核");
  }, [open, isCreate, itemId, dictId, detail.data, detail.dataUpdatedAt, form, busy]);
  const set = (patch: Partial<DictionaryItemFormInput>) => {
    current.current = { ...current.current, ...patch };
    setForm(current.current);
    setErrors((previous) => {
      const next = { ...previous };
      for (const key of Object.keys(patch) as (keyof DictionaryItemFormInput)[]) delete next[key];
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
  // The parent forwards all exits here; it cannot unmount a dirty child directly.
  if (exitRef)
    exitRef.current = (action) => {
      if (!busyRef.current)
        guard(() => {
          sessions.invalidate();
          action();
        });
    };
  useEffect(
    () => () => {
      if (exitRef) exitRef.current = null;
    },
    [exitRef],
  );
  const ready =
    contextReady &&
    (isCreate ||
      (baseline.current !== null &&
        detail.data !== undefined &&
        detail.data.id === itemId &&
        detail.data.dictId === dictId));
  const submit = async () => {
    if (!allowed || !ready || busyRef.current || (!isCreate && detail.isError)) return;
    const failures = validateDictionaryItemForm(current.current, original.current);
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
      if (needsDictionaryItemValueCheck(submitted, original.current)) {
        let exists: boolean;
        try {
          exists = await check.mutateAsync({ dictId: dictId!, value: submitted.value.trim() });
        } catch {
          if (currentSubmission())
            setErrors((e) => ({ ...e, value: "无法确认数据值唯一性，请重试" }));
          return;
        }
        if (!currentSubmission()) return;
        if (exists) {
          setErrors((e) => ({ ...e, value: "当前字典中数据值已存在" }));
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
      if (isCreate) await create.mutateAsync(buildDictionaryItemCreatePayload(dictId!, submitted));
      else
        await update.mutateAsync(
          buildDictionaryItemUpdatePayload(itemId!, submitted, original.current!),
        );
      if (!currentSubmission()) return;
      markClean();
      toast.success(isCreate ? "字典项已创建" : "字典项已更新");
      doClose();
    } catch (error) {
      if (!currentSubmission()) return;
      const message = toUserMessage(error);
      if (
        error instanceof ApiBusinessError &&
        /(数据值|value).*?(已存在|重复)|duplicate.*?(value)/i.test(message)
      )
        setErrors((e) => ({ ...e, value: message }));
      else setSubmitError(message);
    } finally {
      if (sessions.isCurrent(session)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const textField = (field: "value" | "name" | "sort" | "memo", label: string) => {
    const required = field === "value";
    return (
      <div>
        <TextField
          value={form[field]}
          onChange={(value) => set({ [field]: value })}
          isDisabled={busy}
          isReadOnly={false}
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
      <AppModal
        open={open}
        title={isCreate ? "新增字典项" : "编辑字典项"}
        onClose={close}
        size="lg"
      >
        {!allowed ? (
          <p>需要系统管理员权限</p>
        ) : !contextReady ? (
          <p role="alert">字典上下文或 ID 无效，禁止提交</p>
        ) : !ready ? (
          <div>
            {detail.isError ? (
              <p role="alert">加载失败：{toUserMessage(detail.error)}</p>
            ) : (
              <p>正在加载字典项信息…</p>
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
            <p>
              所属字典：{dictionary?.title ?? "—"}（{dictionary?.code ?? "—"}） · 数据类型：
              {dictionaryValueTypeLabel(dictionary?.valueType)}
            </p>
            {textField("value", "数据值")}
            {textField("name", "显示文本")}
            {textField("sort", "排序")}
            <div>
              <TextField
                value={form.attributes}
                onChange={(attributes) => set({ attributes })}
                isDisabled={busy}
                aria-label="附加属性 JSON"
              >
                <Label>附加属性 JSON</Label>
                <TextArea />
              </TextField>
              <FieldError message={errors.attributes} />
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
