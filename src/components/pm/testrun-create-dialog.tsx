/**
 * 测试轮新建弹窗（P2：p2-testrun-workspace）。
 *
 * 三种建轮模式共用一个弹窗（类型可切换，默认由入口预设），忠实老前端
 * TestRunCreateDialog 的三种表单：
 * - FULL_REGRESSION 全量回归：版本 ID（正整数必填）+ 运行名称 + 环境
 * - AD_HOC 临时验证：套件 ID 列表 + 用例 ID 列表（逗号分隔，去重后合计
 *   1–200 项必填）+ 运行名称 + 环境
 * - TARGETED_RETEST 定向复测：来源轮 ID（正整数必填）+ 来源轮用例 ID 列表
 *   （逗号分隔，去重后 1–200 项必填）+ 运行名称 + 环境
 * 校验规则见 src/lib/testrun-form.ts（后端 TestRunCommandServiceImpl
 * 只读核对：runName trim 后 1–200 必填、environment 最多 255、selection
 * 上限 200）。
 *
 * 表单 UX：dirty check（useUnsavedChangesGuard，blocker 独立于 AppModal
 * 挂载）、必填红色星号 RequiredMark、字段级错误 FieldError 挂对应输入下、
 * 编辑即清；请求进行中禁用全部输入与关闭入口。
 */
import { useRef, useState } from "react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import {
  AppModal,
  FieldError,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import {
  toUserMessage,
  useCreateAdHocRun,
  useCreateFullRegression,
  useCreateTargetedRetest,
} from "@/lib/query";
import {
  buildAdHocPayload,
  buildFullRegressionPayload,
  buildTargetedRetestPayload,
  emptyTestRunCreateInput,
  validateTestRunCreateInput,
} from "@/lib/testrun-form";
import type { TestRunCreateInput } from "@/lib/testrun-form";
import {
  TEST_RUN_TYPE_LABELS,
  TEST_RUN_TYPES,
} from "@/lib/api/testRun-types";
import type { TestRunType } from "@/lib/api/testRun-types";

export interface TestRunTargetedContext {
  sourceRunId: number;
  /** 来源轮中失败/阻塞的轮内用例 ID（预填，供用户删减） */
  sourceRunCaseIds: number[];
}

function initialFrom(
  runType: TestRunType,
  targetedContext?: TestRunTargetedContext | null,
): TestRunCreateInput {
  const base = emptyTestRunCreateInput(runType);
  if (runType === "TARGETED_RETEST" && targetedContext) {
    base.sourceRunId = String(targetedContext.sourceRunId);
    base.sourceRunCaseIds = targetedContext.sourceRunCaseIds.join(",");
  }
  return base;
}

export function TestRunCreateDialog({
  open,
  projectId,
  initialRunType,
  targetedContext,
  onCreated,
  onClose,
}: {
  open: boolean;
  projectId: number;
  initialRunType: TestRunType;
  /** 定向复测预填上下文（从已完成轮的工作台进入时传入） */
  targetedContext?: TestRunTargetedContext | null;
  /** 建轮成功后回调（轮 id），调用方一般跳转到工作台 */
  onCreated: (testRunId: number) => void;
  onClose: () => void;
}) {
  const createFull = useCreateFullRegression();
  const createAdHoc = useCreateAdHocRun();
  const createTargeted = useCreateTargetedRetest();
  const isPending =
    createFull.isPending || createAdHoc.isPending || createTargeted.isPending;

  const [form, setForm] = useState<TestRunCreateInput>(() =>
    initialFrom(initialRunType, targetedContext),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  // 打开瞬间的表单快照（ref 持有）；dirty = 当前值偏离快照
  const initialRef = useRef<string | null>(null);
  if (initialRef.current === null) {
    initialRef.current = JSON.stringify(
      initialFrom(initialRunType, targetedContext),
    );
  }
  const isDirty = JSON.stringify(form) !== initialRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(
    open && isDirty,
  );

  const set = (patch: Partial<TestRunCreateInput>, clearAlso: string[] = []) => {
    setForm((current) => ({ ...current, ...patch }));
    setSubmitError("");
    setFieldErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of [...Object.keys(patch), ...clearAlso]) {
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  };

  const doClose = () => {
    setForm(initialFrom(initialRunType, targetedContext));
    setFieldErrors({});
    setSubmitError("");
    onClose();
  };

  const close = () => {
    if (isPending) return;
    guard(doClose);
  };

  const handleSubmit = () => {
    if (isPending) return;
    const errors = validateTestRunCreateInput(form);
    const nextFieldErrors: Record<string, string> = {};
    for (const error of errors) nextFieldErrors[error.field] = error.message;
    setFieldErrors(nextFieldErrors);
    if (errors.length > 0) return;
    setSubmitError("");
    const finish = (id: number, label: string) => {
      toast.success(`测试轮已创建（#${id}，${label}）`);
      markClean();
      doClose();
      onCreated(id);
    };
    const fail = (error: unknown) => {
      setSubmitError(`创建失败：${toUserMessage(error)}`);
    };
    if (form.runType === "FULL_REGRESSION") {
      createFull.mutate(buildFullRegressionPayload(form), {
        onSuccess: (run) => finish(run.id, "全量回归"),
        onError: fail,
      });
    } else if (form.runType === "AD_HOC") {
      createAdHoc.mutate(buildAdHocPayload(form, projectId), {
        onSuccess: (run) => finish(run.id, "临时验证"),
        onError: fail,
      });
    } else {
      createTargeted.mutate(buildTargetedRetestPayload(form), {
        onSuccess: (run) => finish(run.id, "定向复测"),
        onError: fail,
      });
    }
  };

  return (
    <>
      {/* blocker 必须独立于 AppModal 挂载：弹窗关闭不能卸载一个正在等待用户
          作答的路由拦截，否则那次导航会永远挂起（P2） */}
      {blocker}
      <AppModal open={open} title="新建测试轮" onClose={close} size="lg">
        {dialog}
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="建轮类型" className="flex gap-2">
            {TEST_RUN_TYPES.map((type) => (
              <Button
                key={type}
                size="sm"
                variant={form.runType === type ? "primary" : "ghost"}
                isDisabled={isPending}
                onPress={() => set({ runType: type })}
              >
                {TEST_RUN_TYPE_LABELS[type]}
              </Button>
            ))}
          </div>

          <div>
            <TextField
              isDisabled={isPending}
              value={form.runName}
              onChange={(next) => set({ runName: next })}
              aria-label="运行名称"
            >
              <Label>
                运行名称<RequiredMark />
              </Label>
              <Input placeholder="运行名称（1–200 个字符）" />
            </TextField>
            <FieldError message={fieldErrors.runName} />
          </div>

          <div>
            <TextField
              isDisabled={isPending}
              value={form.environment}
              onChange={(next) => set({ environment: next })}
              aria-label="环境"
            >
              <Label>环境</Label>
              <Input placeholder="如：staging（可选，最多 255 个字符）" />
            </TextField>
            <FieldError message={fieldErrors.environment} />
          </div>

          {form.runType === "FULL_REGRESSION" ? (
            <div>
              <TextField
                isDisabled={isPending}
                value={form.versionId}
                onChange={(next) => set({ versionId: next })}
                aria-label="版本 ID"
              >
                <Label>
                  版本 ID<RequiredMark />
                </Label>
                <Input inputMode="numeric" placeholder="正整数（全量回归按版本范围建轮）" />
              </TextField>
              <FieldError message={fieldErrors.versionId} />
            </div>
          ) : null}

          {form.runType === "AD_HOC" ? (
            <>
              <div>
                <TextField
                  isDisabled={isPending}
                  value={form.adHocSuiteIds}
                  onChange={(next) => set({ adHocSuiteIds: next }, ["adHocSelection"])}
                  aria-label="测试套件 ID"
                >
                  <Label>测试套件 ID</Label>
                  <TextArea
                    rows={2}
                    placeholder="逗号分隔的套件 ID，如：12, 34"
                  />
                </TextField>
                <FieldError message={fieldErrors.adHocSuiteIds} />
              </div>
              <div>
                <TextField
                  isDisabled={isPending}
                  value={form.adHocCaseIds}
                  onChange={(next) => set({ adHocCaseIds: next }, ["adHocSelection"])}
                  aria-label="测试用例 ID"
                >
                  <Label>测试用例 ID</Label>
                  <TextArea
                    rows={2}
                    placeholder="逗号分隔的用例 ID，如：101, 102"
                  />
                </TextField>
                <p className="type-caption mt-1 text-default-500">
                  套件与用例选择合计至少 1 项、去重后最多 200 项；套件内的用例会自动展开。
                </p>
                <FieldError message={fieldErrors.adHocCaseIds} />
                <FieldError message={fieldErrors.adHocSelection} />
              </div>
            </>
          ) : null}

          {form.runType === "TARGETED_RETEST" ? (
            <>
              <div>
                <TextField
                  isDisabled={isPending}
                  value={form.sourceRunId}
                  onChange={(next) => set({ sourceRunId: next })}
                  aria-label="来源测试轮 ID"
                >
                  <Label>
                    来源测试轮 ID<RequiredMark />
                  </Label>
                  <Input inputMode="numeric" placeholder="正整数（来源轮必须已完成）" />
                </TextField>
                <FieldError message={fieldErrors.sourceRunId} />
              </div>
              <div>
                <TextField
                  isDisabled={isPending}
                  value={form.sourceRunCaseIds}
                  onChange={(next) => set({ sourceRunCaseIds: next })}
                  aria-label="来源轮用例 ID"
                >
                  <Label>
                    来源轮用例 ID<RequiredMark />
                  </Label>
                  <TextArea
                    rows={2}
                    placeholder="逗号分隔的来源轮内用例 ID，如：201, 202"
                  />
                </TextField>
                <p className="type-caption mt-1 text-default-500">
                  用来源轮详情里的轮内用例 ID（runCaseId），去重后 1–200 项。
                </p>
                <FieldError message={fieldErrors.sourceRunCaseIds} />
              </div>
            </>
          ) : null}

          {submitError ? <p className="type-body text-danger">{submitError}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onPress={close} isDisabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onPress={handleSubmit} isDisabled={isPending}>
              {isPending ? "创建中…" : "创建测试轮"}
            </Button>
          </div>
        </div>
      </AppModal>
    </>
  );
}
