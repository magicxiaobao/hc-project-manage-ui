import { forwardRef, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { FieldError } from "@/components/biz/form-guard";
import { parseWorkLogImport, type ImportPreview } from "@/lib/worklog-io";
import {
  GuardedWorkLogDialog,
  WorkLogTextField,
  type WorkLogLeaveHandle,
} from "./worklog-form-dialog";
export const WorkLogImportDialog = forwardRef<
  WorkLogLeaveHandle,
  { open: boolean; projectId: number; onClose: () => void }
>(function WorkLogImportDialog({ open, projectId, onClose }, ref) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  useEffect(() => {
    if (!open) setPreview(null);
  }, [open]);
  return (
    <GuardedWorkLogDialog
      ref={ref}
      open={open}
      title="批量导入工时"
      initial={{ json: '{"items": []}', selection: "" }}
      onClose={onClose}
      submitLabel="导入"
      submitDisabled
      validate={() => []}
      context={
        <>
          <p role="status">批量导入暂不可用</p>
          <p>
            仅本地校验候选 JSON：每条含当前项目
            projectId、taskId、workDescription、hoursSpent、workDate、workType。前端限制最多 100
            条；任务归属仍需服务端核验。
          </p>
        </>
      }
      renderFields={(draft, edit, errors) => (
        <>
          <WorkLogTextField
            name="json"
            label="导入内容"
            required
            draft={draft}
            errors={{ ...errors, json: preview?.errors.map((e) => e.message).join("；") ?? "" }}
            edit={(field, value) => {
              edit(field, value);
              setPreview(null);
            }}
          />
          <Button
            onPress={() => setPreview(parseWorkLogImport(String(draft.json ?? ""), projectId))}
          >
            校验与预览
          </Button>
          {preview ? (
            <div className="sm:col-span-2">
              <p>预览 {preview.rows.length} 条</p>
              {preview.rows.map((row, i) => (
                <article key={i} className="my-2 rounded border p-2">
                  <button
                    type="button"
                    aria-pressed={draft.selection === String(i)}
                    onClick={() => edit("selection", String(i))}
                  >
                    第 {i + 1} 条
                  </button>
                  {["taskId", "workDescription", "hoursSpent", "projectId"].map((field) => (
                    <div key={field}>
                      <p>
                        {field}：{String(row.draft[field] ?? "—")}
                      </p>
                      {row.errors
                        .filter((e) => e.field === field)
                        .map((e, j) => (
                          <FieldError key={j} message={`第 ${i + 1} 条·${e.field}：${e.message}`} />
                        ))}
                    </div>
                  ))}
                  {row.errors
                    .filter(
                      (e) =>
                        !["taskId", "workDescription", "hoursSpent", "projectId"].includes(e.field),
                    )
                    .map((e, j) => (
                      <div key={j}>
                        <p>
                          {e.field}：{String(row.draft[e.field] ?? "—")}
                        </p>
                        <FieldError message={`第 ${i + 1} 条·${e.field}：${e.message}`} />
                      </div>
                    ))}
                </article>
              ))}
            </div>
          ) : null}
        </>
      )}
    />
  );
});
