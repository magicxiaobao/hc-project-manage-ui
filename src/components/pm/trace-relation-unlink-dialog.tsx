import { useEffect, useRef, useState } from "react";
import { Button, Label, Spinner, TextArea, TextField } from "@heroui/react";
import { AppModal, FieldError, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { ApiBusinessError } from "@/lib/api/client";
import {
  toUserMessage,
  useUnlinkTraceRelation,
  useTraceRelations,
  useRefreshTraceRelationDomains,
} from "@/lib/query";
import {
  canUnlinkRelation,
  relationPayload,
  relationWriteMessage,
  isUncertainRelationWrite,
} from "@/lib/trace-relations";
import { validateUnlinkReason } from "@/lib/trace-relation-form";
import type { FrozenRelation, TraceRelationsContext } from "./trace-relations-section";

export function TraceRelationUnlinkDialog({
  context,
  snapshot,
  onClose,
}: {
  context: TraceRelationsContext;
  snapshot: FrozenRelation;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const initial = useRef("");
  const tuple = useRef(Object.freeze(relationPayload(snapshot.relation)));
  const [reasonError, setReasonError] = useState<string>();
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsRecheck, setNeedsRecheck] = useState(false);
  const locked = useRef(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { guard, dialog, blocker, markClean, cancelConfirm } = useUnsavedChangesGuard(
    reason !== initial.current,
  );
  const unlink = useUnlinkTraceRelation();
  const relations = useTraceRelations({
    projectId: context.projectId,
    objects: [context.object],
    contextVerified: true,
  });
  const refresh = useRefreshTraceRelationDomains();
  const close = () => {
    if (!locked.current) guard(onClose);
  };
  const finish = () => {
    markClean();
    cancelConfirm();
    onClose();
  };
  const submit = async () => {
    if (locked.current || needsRecheck || !canUnlinkRelation(snapshot.relation)) return;
    locked.current = true;
    const validated = validateUnlinkReason(reason);
    setReasonError(validated.error);
    setSubmitError("");
    if (validated.error) {
      locked.current = false;
      reasonRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await unlink.mutateAsync(Object.freeze({ ...tuple.current, reason: validated.reason }));
      if (mounted.current) finish();
    } catch (error) {
      if (mounted.current) {
        setSubmitError(relationWriteMessage(error));
        setNeedsRecheck(
          isUncertainRelationWrite(error) ||
            (error instanceof ApiBusinessError && error.code === 10019),
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const recheck = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const result = await relations.refetch({ throwOnError: true });
      if (!mounted.current) return;
      if (!result.data) throw new Error("关联重查未返回有效数据");
      const stillActive = result.data?.items.some((item) =>
        [...item.outgoing, ...item.incoming].some(
          (row) => row.id === snapshot.relation.id && row.status === "ACTIVE",
        ),
      );
      if (!stillActive) {
        void refresh();
        finish();
      } else {
        setNeedsRecheck(false);
        setSubmitError("重查成功，此关系仍在活动列表。请核对后决定是否再次解除。");
      }
    } catch (error) {
      if (mounted.current) setSubmitError(`重查失败：${toUserMessage(error)}。请先重试读取。`);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <>
      {blocker}
      {dialog}
      <AppModal open title="确认解除关联" onClose={close} size="md" isDismissDisabled={busy}>
        <div className="flex flex-col gap-4">
          <p className="break-words">{snapshot.summary}</p>
          <p className="type-caption break-all">{snapshot.relation.relationType}</p>
          <p>
            解除后该关系将失活并从活动关联列表移除，源/目标对象本身不会删除；此页面不提供恢复入口。
          </p>
          <div data-field="reason">
            <TextField
              value={reason}
              onChange={(value) => {
                if (locked.current) return;
                setReason(value);
                setReasonError(undefined);
                if (!needsRecheck) setSubmitError("");
              }}
              isDisabled={busy}
            >
              <Label>
                解除原因
                <RequiredMark />
              </Label>
              <TextArea ref={reasonRef} rows={4} />
            </TextField>
            <FieldError message={reasonError} />
            <p className="type-caption">{Array.from(reason.trim()).length}/500 Unicode 字符</p>
          </div>
          {submitError ? (
            <p role="alert" className="text-danger">
              {submitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={busy}>
              取消
            </Button>
            {needsRecheck ? (
              <Button variant="secondary" onPress={() => void recheck()} isDisabled={busy}>
                {busy ? <Spinner size="sm" /> : null}重查关联
              </Button>
            ) : (
              <Button
                variant="danger"
                onPress={() => void submit()}
                isDisabled={busy || !canUnlinkRelation(snapshot.relation)}
              >
                {busy ? <Spinner size="sm" /> : null}
                {busy ? "解除中…" : "确认解除"}
              </Button>
            )}
          </div>
        </div>
      </AppModal>
    </>
  );
}
