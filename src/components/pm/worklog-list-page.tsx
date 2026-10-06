import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { Button } from "@heroui/react";
import { AppModal } from "@/components/biz/app-modal";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  useExportWorkLogs,
  useInvalidWorkLog,
  useProjectIdByKey,
  useWorkLogList,
  toUserMessage,
} from "@/lib/query";
import { parseWorkLogId, validWorkLogId } from "@/lib/worklog-form";
import { exportUnavailable, type WorkLogListParams } from "@/lib/worklog-io";
import { workLogActions } from "@/lib/worklog-timer";
import type { WorkLogResponse } from "@/lib/api/worklog-types";
import {
  WorkLogBlockedFilters,
  WorkLogPager,
  WorkLogProjectPicker,
  WorkLogTaskPicker,
  workLogInputClass,
} from "./worklog/worklog-list-controls";
import { WorkLogFormDialog, type WorkLogLeaveHandle } from "./worklog/worklog-form-dialog";
import { WorkLogStartDialog, WorkLogTimerPanel } from "./worklog/worklog-timer-panel";
import { WorkLogApprovalDialog } from "./worklog/worklog-approval-dialog";
import { WorkLogImportDialog } from "./worklog/worklog-import-dialog";
type Target = {
  kind: "form" | "start" | "approval" | "import" | "invalid";
  id?: number;
  mode?: "approve" | "reject";
  record?: WorkLogResponse;
} | null;
export function WorkLogListPage({ projectKey }: { projectKey?: string }) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const resolved = useProjectIdByKey(projectKey ?? "");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const projectId = projectKey ? (resolved.data ?? null) : selectedProject;
  const [draftFilters, setDraftFilters] = useState({ taskId: "", userId: "", sprintId: "" });
  const [appliedFilters, setAppliedFilters] = useState<WorkLogListParams>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [target, setTarget] = useState<Target>(null);
  const [timerId, setTimerId] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [actionError, setActionError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const formRef = useRef<WorkLogLeaveHandle>(null);
  const startRef = useRef<WorkLogLeaveHandle>(null);
  const approvalRef = useRef<WorkLogLeaveHandle>(null);
  const importRef = useRef<WorkLogLeaveHandle>(null);
  const busy = useRef(false);
  const exportBusy = useRef(false);
  const userId = parseWorkLogId(useAuthStore((s) => s.user?.userId));
  const list = useWorkLogList({ ...appliedFilters, projectId, page, pageSize });
  const invalid = useInvalidWorkLog(projectId);
  const exporter = useExportWorkLogs();
  const shouldBlockBusy = useCallback(() => busy.current, []);
  useBlocker({ shouldBlockFn: shouldBlockBusy, enableBeforeUnload: shouldBlockBusy });
  const locked = !!target || writing || exporter.isPending;
  useEffect(() => {
    setDraftFilters({ taskId: "", userId: "", sprintId: "" });
    setAppliedFilters({});
    setPage(1);
    setTimerId(null);
    setFilterError("");
    setExportMessage("");
  }, [projectId]);
  useEffect(() => {
    if (
      list.data &&
      page > Math.max(1, Math.ceil(list.data.total / (list.data.pageSize || pageSize)))
    )
      setPage(Math.max(1, Math.ceil(list.data.total / (list.data.pageSize || pageSize))));
  }, [list.data, page, pageSize]);
  const requestLeave = (action: () => void) => {
    if (busy.current || exportBusy.current) return;
    const ref =
      target?.kind === "form"
        ? formRef
        : target?.kind === "start"
          ? startRef
          : target?.kind === "approval"
            ? approvalRef
            : target?.kind === "import"
              ? importRef
              : null;
    if (ref?.current) ref.current.requestLeave(action);
    else action();
  };
  const open = (next: Target) =>
    requestLeave(() => {
      setActionError("");
      setTarget(next);
    });
  const apply = () => {
    if (locked || exportBusy.current) return;
    const next: WorkLogListParams = {};
    for (const field of ["taskId", "userId", "sprintId"] as const) {
      if (!draftFilters[field].trim()) continue;
      const id = parseWorkLogId(draftFilters[field]);
      if (!id) {
        setFilterError("任务、用户与冲刺 ID 须为正安全整数");
        return;
      }
      next[field] = id;
    }
    setFilterError("");
    setAppliedFilters(next);
    setPage(1);
  };
  const runExport = async () => {
    if (locked || exportBusy.current || !validWorkLogId(projectId)) return;
    exportBusy.current = true;
    setExportMessage("");
    const snapshot = { ...appliedFilters, projectId, page, pageSize };
    try {
      const result = await exporter.mutateAsync(snapshot);
      setExportMessage(exportUnavailable(result));
    } catch (error) {
      setExportMessage(`导出暂不可用：${toUserMessage(error)}`);
    } finally {
      exportBusy.current = false;
    }
  };
  const cancelRecord = async () => {
    if (busy.current || target?.kind !== "invalid" || !target.id) return;
    busy.current = true;
    setWriting(true);
    setActionError("");
    try {
      await invalid.mutateAsync(target.id);
      setTarget(null);
    } catch (error) {
      setActionError(toUserMessage(error));
    } finally {
      busy.current = false;
      setWriting(false);
    }
  };
  const canWrite = validWorkLogId(projectId) && !locked;
  if (!authenticated) return <p>请登录后查看工时管理。</p>;
  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="type-title">工时管理</h1>
        <Link to="/worklogs/analytics" className="text-accent underline">统计分析</Link>
      </div>
      {projectKey ? (
        <div>
          <p>
            项目 {projectKey} · ID {projectId ?? "—"}
          </p>
          {resolved.isLoading ? (
            <p>正在解析项目…</p>
          ) : resolved.isError ? (
            <p role="alert">
              {toUserMessage(resolved.error)}
              <Button onPress={() => void resolved.refetch()}>重试项目</Button>
            </p>
          ) : !projectId ? (
            <p>项目不存在</p>
          ) : null}
        </div>
      ) : (
        <WorkLogProjectPicker
          value={projectId}
          disabled={writing || exporter.isPending}
          onChange={(id) =>
            requestLeave(() => {
              setTarget(null);
              setDraftFilters({ taskId: "", userId: "", sprintId: "" });
              setAppliedFilters({});
              setPage(1);
              setTimerId(null);
              setSelectedProject(id);
            })
          }
        />
      )}
      {!validWorkLogId(projectId) ? <p>请选择项目</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label>关联任务</label>
          <WorkLogTaskPicker
            projectId={projectId}
            value={draftFilters.taskId}
            disabled={locked}
            onChange={(taskId) => setDraftFilters((d) => ({ ...d, taskId }))}
          />
        </div>
        {(["userId", "sprintId"] as const).map((field, i) => (
          <label key={field}>
            {i === 0 ? "用户 ID" : "冲刺 ID"}
            <input
              aria-label={i === 0 ? "用户 ID" : "冲刺 ID"}
              className={workLogInputClass}
              value={draftFilters[field]}
              disabled={locked || !projectId}
              onChange={(e) => {
                setFilterError("");
                setDraftFilters((d) => ({ ...d, [field]: e.target.value }));
              }}
            />
          </label>
        ))}
      </div>
      <WorkLogBlockedFilters />
      {filterError ? <p role="alert">{filterError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={locked || !projectId} onPress={apply}>
          搜索
        </Button>
        <Button
          isDisabled={locked || !projectId}
          onPress={() => {
            if (exportBusy.current) return;
            setDraftFilters({ taskId: "", userId: "", sprintId: "" });
            setAppliedFilters({});
            setPage(1);
            setFilterError("");
          }}
        >
          重置
        </Button>
        <Button isDisabled={!canWrite} onPress={() => open({ kind: "form" })}>
          登记工时
        </Button>
        <Button isDisabled={!canWrite || !userId} onPress={() => open({ kind: "start" })}>
          开始计时
        </Button>
        <Button isDisabled={!canWrite} onPress={() => open({ kind: "import" })}>
          批量导入
        </Button>
        <Button isDisabled={!canWrite} onPress={() => void runExport()}>
          请求导出
        </Button>
        <Button isDisabled>下载导出文件</Button>
        <Button isDisabled>开始既有记录</Button>
      </div>
      <p className="type-caption">
        批量导入暂不可用；导出文件暂不可用；既有登记记录暂不可开始计时。
      </p>
      {!userId ? <p role="alert">当前登录身份无效，开始计时暂不可用。</p> : null}
      {exportMessage ? <p role="status">{exportMessage}</p> : null}
      {exporter.isPending ? <p>正在请求导出…</p> : null}
      {list.isLoading && projectId ? <p>正在加载工时…</p> : null}
      {list.isFetching && list.data ? <p>正在刷新工时…</p> : null}
      {list.isError ? (
        <p role="alert">
          {list.data ? "列表刷新失败：" : "列表加载失败："}
          {toUserMessage(list.error)}
          <Button onPress={() => void list.refetch()}>重试列表</Button>
        </p>
      ) : null}
      {list.data ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {[
                    "描述",
                    "任务 ID",
                    "提交人 ID",
                    "类型",
                    "工作日期",
                    "工时",
                    "状态",
                    "审批状态",
                    "地点",
                    "计费",
                    "加班",
                    "操作",
                  ].map((v) => (
                    <th key={v} className="p-2 text-left">
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data.list.map((row) => (
                  <tr key={row.id}>
                    {(
                      [
                        "workDescription",
                        "taskId",
                        "userId",
                        "workType",
                        "workDate",
                        "hoursSpent",
                        "status",
                        "approvalStatus",
                        "workLocation",
                        "isBillable",
                        "isOvertime",
                      ] as const
                    ).map((field) => (
                      <td key={field} className="p-2">
                        {row[field] == null
                          ? "—"
                          : typeof row[field] === "boolean"
                            ? row[field]
                              ? "是"
                              : "否"
                            : row[field]}
                      </td>
                    ))}
                    <td className="p-2">
                      <Button isDisabled={locked} onPress={() => setTimerId(row.id)}>
                        详情
                      </Button>
                      {workLogActions(row).edit ? (
                        <>
                          <Button
                            isDisabled={locked}
                            onPress={() => open({ kind: "form", id: row.id })}
                          >
                            编辑
                          </Button>
                          <Button
                            isDisabled={locked}
                            onPress={() => open({ kind: "invalid", id: row.id, record: row })}
                          >
                            删除
                          </Button>
                        </>
                      ) : null}
                      {row.approvalStatus === "待审批" && workLogActions(row).edit ? (
                        <>
                          <Button
                            isDisabled={locked || !userId || row.userId === userId}
                            onPress={() => open({ kind: "approval", id: row.id, mode: "approve" })}
                          >
                            通过
                          </Button>
                          <Button
                            isDisabled={locked || !userId || row.userId === userId}
                            onPress={() => open({ kind: "approval", id: row.id, mode: "reject" })}
                          >
                            驳回
                          </Button>
                          {row.userId === userId ? <span>不能审批自己的工时记录</span> : null}
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.data.list.length ? <p>暂无工时记录</p> : null}
          <div className="flex items-center gap-4">
            <span>共 {list.data.total} 条</span>
            <WorkLogPager
              page={page}
              pages={Math.ceil(list.data.total / (list.data.pageSize || pageSize))}
              disabled={locked}
              onChange={(next) => {
                if (!exportBusy.current) setPage(next);
              }}
            />
            <label>
              每页条数
              <select
                aria-label="每页条数"
                disabled={locked}
                value={pageSize}
                onChange={(e) => {
                  if (exportBusy.current) return;
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option>10</option>
                <option>20</option>
                <option>50</option>
              </select>
            </label>
          </div>
        </>
      ) : null}
      <WorkLogTimerPanel
        id={timerId}
        projectId={projectId ?? 0}
        disabled={!!target || exporter.isPending}
        onBusy={(value) => {
          busy.current = value;
          setWriting(value);
        }}
      />
      <WorkLogFormDialog
        ref={formRef}
        open={target?.kind === "form"}
        id={target?.kind === "form" ? target.id : undefined}
        projectId={projectId ?? 0}
        onClose={() => setTarget(null)}
        onSaved={setTimerId}
      />
      <WorkLogStartDialog
        ref={startRef}
        open={target?.kind === "start"}
        projectId={projectId ?? 0}
        onClose={() => setTarget(null)}
        onStarted={setTimerId}
      />
      <WorkLogApprovalDialog
        ref={approvalRef}
        open={target?.kind === "approval"}
        id={target?.kind === "approval" ? (target.id ?? null) : null}
        mode={target?.kind === "approval" ? (target.mode ?? "approve") : "approve"}
        projectId={projectId ?? 0}
        onClose={() => setTarget(null)}
      />
      <WorkLogImportDialog
        ref={importRef}
        open={target?.kind === "import"}
        projectId={projectId ?? 0}
        onClose={() => setTarget(null)}
      />
      <AppModal
        open={target?.kind === "invalid"}
        title="确认删除工时记录"
        onClose={() => {
          if (!busy.current) setTarget(null);
        }}
        isDismissDisabled={writing}
      >
        <p>{target?.record?.workDescription ?? "—"}</p>
        <p>将记录置为已取消，任务实际工时可能更新。</p>
        {actionError ? <p role="alert">{actionError}</p> : null}
        <Button
          isDisabled={writing}
          onPress={() => {
            if (!busy.current) setTarget(null);
          }}
        >
          取消
        </Button>
        <Button isDisabled={writing} onPress={() => void cancelRecord()}>
          确认删除
        </Button>
      </AppModal>
    </main>
  );
}
