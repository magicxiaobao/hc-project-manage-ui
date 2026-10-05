import { useEffect, useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
import {
  AppModal,
  OptionSelect,
  RequiredMark,
  FieldError,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { ApiBusinessError } from "@/lib/api/client";
import {
  toUserMessage,
  useTraceRelationCandidates,
  useLinkTraceRelation,
  useTraceRelations,
  useRefreshTraceRelationDomains,
} from "@/lib/query";
import {
  OBJECT_LABELS,
  RELATION_LABELS,
  objectLabel,
  relationPayload,
  isUncertainRelationWrite,
  relationWriteMessage,
} from "@/lib/trace-relations";
import {
  allowedOtherTypes,
  allowedRelationTypes,
  buildTraceRelationPayload,
  editTraceRelationForm,
  emptyTraceRelationForm,
  traceRelationFormDirty,
  validateTraceRelationForm,
  type TraceRelationErrors,
  type TraceRelationForm,
  type SelectedRelationCandidate,
} from "@/lib/trace-relation-form";
import type { AlmObjectType, LinkRelationPayload } from "@/lib/api/trace-types";
import type { TraceRelationsContext } from "./trace-relations-section";

/** 父级按当前对象、项目及每次打开的会话重挂载，刷新不覆盖草稿。 */
export function TraceRelationFormDialog({
  context,
  onClose,
}: {
  context: TraceRelationsContext;
  onClose: () => void;
}) {
  const [form, setForm] = useState(emptyTraceRelationForm);
  const snapshot = useRef({ ...form });
  const [selected, setSelected] = useState<SelectedRelationCandidate | null>(null);
  const [errors, setErrors] = useState<TraceRelationErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsRecheck, setNeedsRecheck] = useState(false);
  const locked = useRef(false);
  const lastAttempt = useRef<LinkRelationPayload | null>(null);
  const mounted = useRef(true);
  const fieldsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { guard, dialog, blocker, markClean, cancelConfirm } = useUnsavedChangesGuard(
    traceRelationFormDirty(form, snapshot.current),
  );
  const candidates = useTraceRelationCandidates(
    form.targetType,
    context.projectId,
    page,
    title,
    true,
  );
  const relations = useTraceRelations({
    projectId: context.projectId,
    objects: [context.object],
    contextVerified: true,
  });
  const refresh = useRefreshTraceRelationDomains();
  const create = useLinkTraceRelation();
  const editingDisabled = busy || needsRecheck;
  const unavailable =
    !!form.targetType && (candidates.isPending || candidates.isError || !candidates.data);
  const close = () => {
    if (!locked.current) guard(onClose);
  };
  const finish = () => {
    markClean();
    cancelConfirm();
    onClose();
  };
  const edit = (field: keyof TraceRelationForm, value: string) => {
    if (locked.current || needsRecheck) return;
    const next = editTraceRelationForm(form, errors, field, value);
    setForm(next.form);
    setErrors(next.errors);
    // 未确认写结果前保留重查提示，即使继续修正草稿也不能重发。
    if (!needsRecheck) setSubmitError("");
    if (field === "targetType") {
      setSelected(null);
      setPage(1);
      setTitle("");
      setSearch("");
    }
    if (field === "targetId") {
      const candidate =
        candidates.candidates.find((row) => String(row.id) === value) ??
        (String(selected?.id) === value ? selected : null);
      setSelected(
        candidate ? { ...candidate, objectType: form.targetType as AlmObjectType } : null,
      );
    }
  };
  const submit = async () => {
    if (locked.current || needsRecheck) return;
    locked.current = true;
    const nextErrors = validateTraceRelationForm(form, context.object, context.projectId, selected);
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length) {
      locked.current = false;
      const first = Object.keys(nextErrors)[0];
      fieldsRef.current
        ?.querySelector<HTMLElement>(
          `[data-field="${first}"] input, [data-field="${first}"] button`,
        )
        ?.focus();
      return;
    }
    if (unavailable) {
      locked.current = false;
      return;
    }
    const payload = Object.freeze(buildTraceRelationPayload(form, context.object));
    lastAttempt.current = payload;
    setBusy(true);
    try {
      await create.mutateAsync(payload);
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
      const desired = lastAttempt.current;
      const found = result.data?.items
        .flatMap((item) => [...item.outgoing, ...item.incoming])
        .some(
          (row) =>
            row.status === "ACTIVE" &&
            JSON.stringify(relationPayload(row)) === JSON.stringify(desired),
        );
      if (found) {
        void refresh();
        finish();
      } else {
        setNeedsRecheck(false);
        setSubmitError("重查成功，活动列表尚无此关系，请核对后决定是否创建。");
      }
    } catch (error) {
      if (mounted.current)
        setSubmitError(`重查失败：${toUserMessage(error)}。请重试读取后再提交。`);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const options = candidates.candidates.map((row) => ({
    id: String(row.id),
    label: `#${row.id}${row.title ? ` ${row.title}` : ""}`,
  }));
  if (selected && !options.some((option) => option.id === String(selected.id)))
    options.unshift({
      id: String(selected.id),
      label: `#${selected.id}${selected.title ? ` ${selected.title}` : ""}（已选）`,
    });
  const totalPages = Math.max(1, Math.ceil((candidates.data?.total ?? 0) / 20));
  let preview = "";
  if (
    !Object.keys(validateTraceRelationForm(form, context.object, context.projectId, selected))
      .length
  ) {
    const payload = buildTraceRelationPayload(form, context.object);
    preview = `${objectLabel({ objectType: payload.sourceType, objectId: payload.sourceId }, payload.sourceId === context.object.objectId && payload.sourceType === context.object.objectType ? context.title : selected?.title)} → ${objectLabel({ objectType: payload.targetType, objectId: payload.targetId }, payload.targetId === context.object.objectId && payload.targetType === context.object.objectType ? context.title : selected?.title)}`;
  }
  return (
    <>
      {blocker}
      {dialog}
      <AppModal open title="新建关联" onClose={close} size="md" isDismissDisabled={busy}>
        <div ref={fieldsRef} className="flex flex-col gap-4">
          <p className="type-caption">
            当前对象：{objectLabel(context.object, context.title)} · 项目 {context.projectKey}
          </p>
          <div data-field="targetType">
            <Label className="mb-1 block">
              目标对象类型
              <RequiredMark />
            </Label>
            <OptionSelect
              label="目标对象类型"
              value={form.targetType}
              options={[
                { id: "", label: "请选择" },
                ...allowedOtherTypes(context.object.objectType).map((type) => ({
                  id: type,
                  label: OBJECT_LABELS[type],
                })),
              ]}
              onChange={(value) => edit("targetType", value)}
              isDisabled={editingDisabled}
            />
            <FieldError message={errors.targetType} />
          </div>
          {form.targetType ? (
            <div className="space-y-2">
              <TextField
                value={search}
                onChange={(value) => {
                  if (!locked.current && !needsRecheck) setSearch(value);
                }}
                isDisabled={editingDisabled}
              >
                <Label>按标题查询候选</Label>
                <Input />
              </TextField>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={editingDisabled || candidates.isFetching}
                onPress={() => {
                  setTitle(search);
                  setPage(1);
                }}
              >
                查询
              </Button>
            </div>
          ) : null}
          <div data-field="targetId">
            <Label className="mb-1 block">
              目标对象
              <RequiredMark />
            </Label>
            <OptionSelect
              label="目标对象"
              value={form.targetId}
              options={[{ id: "", label: "请选择" }, ...options]}
              onChange={(value) => edit("targetId", value)}
              isDisabled={editingDisabled || !form.targetType || unavailable}
            />
            <FieldError message={errors.targetId} />
            {selected ? (
              <p className="type-caption">
                已选：
                {objectLabel(
                  { objectType: selected.objectType, objectId: selected.id as number },
                  selected.title,
                )}
              </p>
            ) : null}
          </div>
          {form.targetType && candidates.isPending ? (
            <p>
              <Spinner size="sm" /> 正在加载候选…
            </p>
          ) : null}
          {form.targetType && candidates.isError ? (
            <p role="alert" className="text-danger">
              候选加载失败：{toUserMessage(candidates.error)}
              <Button
                size="sm"
                variant="ghost"
                isDisabled={editingDisabled}
                onPress={() => void candidates.refetch()}
              >
                重试候选
              </Button>
            </p>
          ) : null}
          {form.targetType && candidates.data ? (
            <div className="space-y-2">
              {!candidates.candidates.length ? (
                <p className="type-caption">本页无可选的同项目对象。</p>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={editingDisabled || candidates.isFetching || page <= 1}
                  onPress={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <span>
                  第 {page} 页 / {totalPages} 页
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={editingDisabled || candidates.isFetching || page >= totalPages}
                  onPress={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
          <div data-field="relationType">
            <Label className="mb-1 block">
              关系类型
              <RequiredMark />
            </Label>
            <OptionSelect
              label="关系类型"
              value={form.relationType}
              options={[
                { id: "", label: "请选择" },
                ...allowedRelationTypes(context.object.objectType, form.targetType).map((type) => ({
                  id: type,
                  label: RELATION_LABELS[type],
                })),
              ]}
              onChange={(value) => edit("relationType", value)}
              isDisabled={editingDisabled}
            />
            <FieldError message={errors.relationType} />
          </div>
          <p className="type-caption">
            “目标对象”指选择的另一端。
            {preview ? `源对象 → 目标对象：${preview}` : "选齐后显示源对象 → 目标对象预览。"}
          </p>
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
              <Button variant="secondary" isDisabled={busy} onPress={() => void recheck()}>
                {busy ? <Spinner size="sm" /> : null}重查关联
              </Button>
            ) : (
              <Button
                variant="primary"
                isDisabled={editingDisabled || unavailable}
                onPress={() => void submit()}
              >
                {busy ? <Spinner size="sm" /> : null}
                {busy ? "创建中…" : "创建关联"}
              </Button>
            )}
          </div>
        </div>
      </AppModal>
    </>
  );
}
