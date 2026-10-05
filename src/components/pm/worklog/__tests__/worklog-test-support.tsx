import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { WorkLogFormDialog, type WorkLogLeaveHandle } from "../worklog-form-dialog";
import { WorkLogStartDialog } from "../worklog-timer-panel";
import { WorkLogApprovalDialog } from "../worklog-approval-dialog";
import { WorkLogImportDialog } from "../worklog-import-dialog";
import type { WorkLogResponse } from "@/lib/api/worklog-types";
import { workLogApi } from "@/lib/api/worklog";
import { projectApi } from "@/lib/api/project";
import { taskApi } from "@/lib/api/task";
import { useAuthStore } from "@/lib/api/auth-store";
// 隔离动画/portal，保留实际表单、路由守卫和 Query。选项仍沿用 label 读屏名。
vi.mock("@heroui/react", () => ({
  Button: ({
    children,
    onPress,
    isDisabled,
    type,
  }: {
    children: ReactNode;
    onPress?: () => void;
    isDisabled?: boolean;
    type?: "button" | "submit";
  }) => (
    <button type={type ?? "button"} disabled={isDisabled} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/biz/option-select", () => ({
  OptionSelect: ({
    label,
    value,
    options,
    onChange,
    isDisabled,
  }: {
    label: string;
    value: string;
    options: { id: string; label: string }[];
    onChange: (value: string) => void;
    isDisabled?: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={isDisabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("@/components/biz/app-modal", () => ({
  AppModal: ({
    open,
    title,
    onClose,
    children,
    isCloseDisabled,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
    isCloseDisabled?: boolean;
  }) => {
    useEffect(() => {
      if (!open) return;
      const handler = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !isCloseDisabled) onClose();
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, onClose, isCloseDisabled]);
    return open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <button disabled={isCloseDisabled} onClick={onClose}>
          关闭{title}
        </button>
        <button disabled={isCloseDisabled} onClick={onClose}>
          遮罩{title}
        </button>
        {children}
      </div>
    ) : null;
  },
}));
export function workLogRecord(overrides: Partial<WorkLogResponse> = {}): WorkLogResponse {
  return {
    id: 11,
    createdAt: null,
    updatedAt: null,
    taskId: 8,
    userId: 42,
    projectId: 7,
    sprintId: null,
    workDescription: "原描述",
    workType: "未知类型",
    workDate: "2020-01-01T12:34:56",
    startTime: null,
    endTime: null,
    hoursSpent: 1,
    remainingHours: null,
    progressPercentage: 0,
    status: "进行中",
    isBillable: false,
    billingRate: 0,
    workLocation: "未知地点",
    tags: "a,b",
    isOvertime: null,
    approvalStatus: "待审批",
    approverId: null,
    approvalTime: null,
    approvalComment: null,
    ...overrides,
  };
}
export function mockWorkLogApis() {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: "42",
      userName: "当前用户",
      roles: [],
      cnName: null,
      extraInfo: {},
      authorities: [],
    },
  });
  vi.spyOn(workLogApi, "getById").mockResolvedValue(workLogRecord());
  vi.spyOn(workLogApi, "findByPage").mockResolvedValue({
    list: [workLogRecord()],
    total: 1,
    pageNumber: 1,
    pageSize: 10,
  });
  vi.spyOn(workLogApi, "createWorkLog").mockResolvedValue(11);
  vi.spyOn(workLogApi, "startWork").mockResolvedValue(12);
  for (const method of [
    "updateWorkLog",
    "pauseWork",
    "completeWork",
    "approveWorkLog",
    "rejectWorkLog",
    "invalidWorkLog",
  ] as const)
    vi.spyOn(workLogApi, method).mockResolvedValue("ok");
  vi.spyOn(workLogApi, "exportWorkLogs").mockResolvedValue(null);
  vi.spyOn(workLogApi, "batchImport").mockResolvedValue("导入成功");
  vi.spyOn(projectApi, "getProjectList").mockResolvedValue({
    list: [{ id: 7, projectName: "项目七", projectKey: "P7" }] as never[],
    total: 21,
    pageNumber: 1,
    pageSize: 20,
  });
  vi.spyOn(taskApi, "findByPage").mockResolvedValue({
    list: [{ id: 8, title: "任务八", projectId: 7 }] as never[],
    total: 21,
    pageNumber: 1,
    pageSize: 20,
  });
  vi.spyOn(taskApi, "findById").mockResolvedValue({
    id: 8,
    title: "任务八",
    projectId: 7,
  } as never);
}
export async function renderWorkLogContent(content: ReactNode, browser = false) {
  window.scrollTo = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const form = createRoute({ getParentRoute: () => root, path: "/form", component: () => content });
  const away = createRoute({
    getParentRoute: () => root,
    path: "/away",
    component: () => <p>已离开</p>,
  });
  if (browser) window.history.replaceState(null, "", "/away");
  const history = browser
    ? createBrowserHistory()
    : createMemoryHistory({ initialEntries: ["/away", "/form"], initialIndex: 1 });
  if (browser) {
    history.push("/form");
    history.flush?.();
  }
  const router = createRouter({ routeTree: root.addChildren([form, away]), history });
  await router.load();
  return {
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    client,
    router,
  };
}
export type FormKind = "form" | "start" | "approval" | "import";
export async function renderWorkLogForm(kind: FormKind, id?: number, browser = false) {
  function Harness() {
    const [open, setOpen] = useState(true);
    const ref = useRef<WorkLogLeaveHandle>(null);
    const props = { ref, open, projectId: 7, onClose: () => setOpen(false) };
    return (
      <>
        <button onClick={() => setOpen(true)}>重新打开</button>
        <button onClick={() => ref.current?.requestLeave(() => setOpen(false))}>父层关闭</button>
        {kind === "form" ? (
          <WorkLogFormDialog {...props} id={id} />
        ) : kind === "start" ? (
          <WorkLogStartDialog {...props} onStarted={() => {}} />
        ) : kind === "approval" ? (
          <WorkLogApprovalDialog {...props} id={id ?? 11} mode="approve" />
        ) : (
          <WorkLogImportDialog {...props} />
        )}
      </>
    );
  }
  return renderWorkLogContent(<Harness />, browser);
}
