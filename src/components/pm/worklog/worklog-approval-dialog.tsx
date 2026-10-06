import { forwardRef } from "react";
import { useAuthStore } from "@/lib/api/auth-store";
import { useApproveWorkLog, useRejectWorkLog, useWorkLogDetail, toUserMessage } from "@/lib/query";
import { workLogActions } from "@/lib/worklog-timer";
import { parseWorkLogId, validWorkLogId } from "@/lib/worklog-form";
import {
  GuardedWorkLogDialog,
  WorkLogField,
  WorkLogTextField,
  type WorkLogLeaveHandle,
} from "./worklog-form-dialog";
import { workLogInputClass } from "./worklog-list-controls";
import { Button } from "@heroui/react";
export const WorkLogApprovalDialog = forwardRef<
  WorkLogLeaveHandle,
  {
    open: boolean;
    id: number | null;
    projectId: number;
    mode: "approve" | "reject";
    onClose: () => void;
  }
>(function WorkLogApprovalDialog({ open, id, projectId, mode, onClose }, ref) {
  const detail = useWorkLogDetail(id, open);
  const user = useAuthStore((s) => s.user);
  const userId = parseWorkLogId(user?.userId);
  const approve = useApproveWorkLog(projectId);
  const reject = useRejectWorkLog(projectId);
  const record = detail.data;
  return (
    <GuardedWorkLogDialog
      ref={ref}
      open={open}
      title="工时审批"
      initial={{ mode, comment: "" }}
      onClose={onClose}
      submitLabel="确认审批"
      validate={() => [
        ...(!userId ? [{ field: "approverId", message: "当前登录身份无效，请重新登录" }] : []),
        ...(!validWorkLogId(id) || !record || record.projectId !== projectId
          ? [{ field: "record", message: "记录不存在或归属未确认" }]
          : record.userId === userId
            ? [{ field: "record", message: "不能审批自己的工时记录" }]
            : record.approvalStatus !== "待审批" || !workLogActions(record).edit
              ? [{ field: "record", message: "当前记录不可审批" }]
              : []),
      ]}
      save={async (draft) => {
        await (draft.mode === "reject" ? reject : approve).mutateAsync({
          id: id!,
          comment: String(draft.comment ?? ""),
        });
      }}
      renderFields={(draft, edit, errors) => (
        <>
          <WorkLogField
            name="record"
            label="审批记录"
            error={
              errors.record ?? (record?.userId === userId ? "不能审批自己的工时记录" : undefined)
            }
          >
            <p>
              {record
                ? `${record.workDescription ?? "—"} · 任务 ${record.taskId ?? "—"} · 工时 ${record.hoursSpent ?? "—"} · 提交人 ${record.userId ?? "—"}`
                : "正在加载记录…"}
            </p>
          </WorkLogField>
          <WorkLogField name="approverId" label="当前审批人（只读）" error={errors.approverId}>
            <p>{userId ?? "—"}</p>
          </WorkLogField>
          <WorkLogField name="mode" label="审批操作">
            <select
              id="worklog-mode"
              className={workLogInputClass}
              value={String(draft.mode)}
              onChange={(e) => edit("mode", e.target.value)}
            >
              <option value="approve">通过</option>
              <option value="reject">驳回</option>
            </select>
          </WorkLogField>
          <WorkLogTextField
            name="comment"
            label="审批意见（选填）"
            draft={draft}
            edit={edit}
            errors={errors}
          />
        </>
      )}
      context={
        detail.isError ? (
          <p role="alert">
            {toUserMessage(detail.error)}
            <Button onPress={() => void detail.refetch()}>重试详情</Button>
          </p>
        ) : record?.userId === userId ? (
          <p role="alert">不能审批自己的工时记录</p>
        ) : null
      }
      submitDisabled={!!record && record.userId === userId}
    />
  );
});
