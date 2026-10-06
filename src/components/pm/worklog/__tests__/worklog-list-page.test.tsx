// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mockWorkLogApis, renderWorkLogContent, workLogRecord } from "./worklog-test-support";
import { WorkLogListPage } from "../../worklog-list-page";
import { workLogApi } from "@/lib/api/worklog";
import { projectApi } from "@/lib/api/project";
import { taskApi } from "@/lib/api/task";
import { useAuthStore } from "@/lib/api/auth-store";
beforeEach(mockWorkLogApis);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
export async function selectProject() {
  const picker = await screen.findByLabelText("项目");
  await waitFor(() => expect(picker.querySelector('option[value="7"]')).toBeTruthy());
  fireEvent.change(picker, { target: { value: "7" } });
  await screen.findByText("原描述");
}
it("未登录不查询，未选项目不读取工时，阻塞控件禁用", async () => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  const v = await renderWorkLogContent(<WorkLogListPage />);
  expect(projectApi.getProjectList).not.toHaveBeenCalled();
  expect(workLogApi.findByPage).not.toHaveBeenCalled();
  v.unmount();
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      userId: "42",
      userName: "当前人",
      roles: [],
      cnName: null,
      extraInfo: {},
      authorities: [],
    },
  });
  await renderWorkLogContent(<WorkLogListPage />);
  await screen.findByText("请选择项目", { selector: "p" });
  expect(workLogApi.findByPage).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "登记工时" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  for (const name of [
    "工作日期",
    "工期开始日期",
    "工期结束日期",
    "状态",
    "审批状态",
    "工作类型",
    "地点",
  ])
    expect((screen.getByLabelText(name).closest("fieldset") as HTMLFieldSetElement).disabled).toBe(
      true,
    );
  expect((screen.getByText("下载导出文件") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByText("开始既有记录") as HTMLButtonElement).disabled).toBe(true);
});
it("项目/任务选项分页与所选项保留；搜索组合 ID，分页/重置保留项目", async () => {
  await renderWorkLogContent(<WorkLogListPage />);
  await selectProject();
  vi.mocked(projectApi.getProjectList).mockResolvedValue({
    list: [{ id: 9, projectName: "九", projectKey: "P9" }] as never[],
    total: 21,
    pageNumber: 2,
    pageSize: 20,
  });
  fireEvent.click(screen.getByText("项目下一页"));
  await screen.findByRole("option", { name: "九 (P9)" });
  expect((screen.getByLabelText("项目") as HTMLSelectElement).value).toBe("7");
  const task = screen.getByLabelText("关联任务");
  await waitFor(() => expect(task.querySelector('option[value="8"]')).toBeTruthy());
  fireEvent.change(task, { target: { value: "8" } });
  vi.mocked(taskApi.findByPage).mockResolvedValue({
    list: [{ id: 10, title: "任务十", projectId: 7 }] as never[],
    total: 21,
    pageNumber: 2,
    pageSize: 20,
  });
  fireEvent.click(screen.getByText("任务下一页"));
  await screen.findByRole("option", { name: "任务十 (#10)" });
  expect((task as HTMLSelectElement).value).toBe("8");
  fireEvent.change(screen.getByLabelText("用户 ID"), { target: { value: "55" } });
  fireEvent.change(screen.getByLabelText("冲刺 ID"), { target: { value: "6" } });
  fireEvent.click(screen.getByText("搜索"));
  await waitFor(() =>
    expect(workLogApi.findByPage).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 10,
      bean: { projectId: 7, taskId: 8, userId: 55, sprintId: 6 },
    }),
  );
  await screen.findByLabelText("每页条数");
  fireEvent.change(screen.getByLabelText("每页条数"), { target: { value: "20" } });
  await waitFor(() =>
    expect(workLogApi.findByPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageSize: 20 }),
    ),
  );
  fireEvent.click(screen.getByText("重置"));
  await waitFor(() =>
    expect(workLogApi.findByPage).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    }),
  );
});
it("项目与任务加载失败可重试，列表刷新失败保留数据，null/0/false 保持区分", async () => {
  vi.mocked(projectApi.getProjectList).mockRejectedValueOnce(new Error("选项失败"));
  const v = await renderWorkLogContent(<WorkLogListPage />);
  await screen.findByText(/项目加载失败/);
  fireEvent.click(screen.getByText("重试项目"));
  await selectProject();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  expect(screen.getByText("否")).toBeTruthy();
  vi.mocked(taskApi.findByPage).mockRejectedValueOnce(new Error("任务失败"));
  await v.client.invalidateQueries({ queryKey: ["hc", "task"] });
  await screen.findByText(/任务加载失败/);
  fireEvent.click(screen.getByText("重试任务"));
  await waitFor(() => expect(screen.queryByText(/任务加载失败/)).toBeNull());
  vi.mocked(workLogApi.findByPage).mockRejectedValueOnce(new Error("刷新失败"));
  await v.client.invalidateQueries({ queryKey: ["hc", "workLog"] });
  await screen.findByText(/列表刷新失败/);
  expect(screen.getByText("原描述")).toBeTruthy();
});
it("项目路由解析数字 ID 并锁范围，后端元数据越界回落，不跨项目展示占位", async () => {
  vi.spyOn(projectApi, "findByPage").mockResolvedValue({
    list: [{ id: 7, projectKey: "P7" }] as never[],
    total: 1,
    pageNumber: 1,
    pageSize: 100,
  });
  await renderWorkLogContent(<WorkLogListPage projectKey="P7" />);
  await screen.findByText("原描述");
  expect(screen.queryByLabelText("项目")).toBeNull();
  expect(workLogApi.findByPage).toHaveBeenCalledWith({
    page: 1,
    pageSize: 10,
    bean: { projectId: 7 },
  });
});
it("页数使用后端 total/pageSize；失效后越界回到最后有效页，零条回 1", async () => {
  vi.mocked(workLogApi.findByPage).mockResolvedValue({
    list: [workLogRecord()],
    total: 21,
    pageNumber: 1,
    pageSize: 10,
  });
  const v = await renderWorkLogContent(<WorkLogListPage />);
  await selectProject();
  fireEvent.click(screen.getByText("记录下一页"));
  await screen.findByText("原描述");
  await waitFor(() =>
    expect(workLogApi.findByPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
  );
  vi.mocked(workLogApi.findByPage).mockResolvedValue({
    list: [],
    total: 0,
    pageNumber: 2,
    pageSize: 10,
  });
  await act(async () => {
    await v.client.invalidateQueries({ queryKey: ["hc", "workLog"] });
  });
  await waitFor(() =>
    expect(workLogApi.findByPage).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
  );
  expect(screen.getByText("共 0 条")).toBeTruthy();
});
