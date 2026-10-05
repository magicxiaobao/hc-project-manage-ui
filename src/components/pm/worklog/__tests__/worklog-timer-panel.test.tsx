// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  mockWorkLogApis,
  renderWorkLogContent,
  renderWorkLogForm,
  workLogRecord,
} from "./worklog-test-support";
import { WorkLogTimerPanel } from "../worklog-timer-panel";
import { WorkLogListPage } from "../../worklog-list-page";
import { workLogApi } from "@/lib/api/worklog";
import { useAuthStore } from "@/lib/api/auth-store";
beforeEach(mockWorkLogApis);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
it("开始只请求一次 startWork，当前身份与类型，不请求 create，获取新 ID 详情", async () => {
  await renderWorkLogContent(<WorkLogListPage />);
  await waitFor(() =>
    expect(screen.getByLabelText("项目").querySelector('option[value="7"]')).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("项目"), { target: { value: "7" } });
  await screen.findByText("原描述");
  fireEvent.click(screen.getByText("开始计时"));
  await screen.findByLabelText("关联任务（必填）");
  fireEvent.change(screen.getByLabelText("关联任务（必填）"), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/工作描述/), { target: { value: "计时描述" } });
  await screen.findByText("任务归属已确认");
  fireEvent.click(
    screen.getByRole("dialog", { name: "开始计时" }).querySelector("button[type=submit]")!,
  );
  await waitFor(() =>
    expect(workLogApi.startWork).toHaveBeenCalledWith({
      taskId: 8,
      userId: 42,
      workDescription: "计时描述",
      workType: "开发",
    }),
  );
  expect(workLogApi.startWork).toHaveBeenCalledTimes(1);
  expect(workLogApi.createWorkLog).not.toHaveBeenCalled();
  await waitFor(() => expect(workLogApi.getById).toHaveBeenCalledWith(12));
});
it("开始全量校验并编辑清错，零返回保留草稿，pending 路由/关闭直接拒绝，失败恢复确认", async () => {
  let reject!: (e: Error) => void;
  vi.mocked(workLogApi.startWork)
    .mockResolvedValueOnce(0)
    .mockImplementationOnce(
      () =>
        new Promise((_r, fail) => {
          reject = fail;
        }),
    );
  const view = await renderWorkLogForm("start");
  await screen.findByLabelText(/工作描述/);
  fireEvent.click(screen.getByRole("button", { name: "开始计时" }));
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("关联任务（必填）"), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/工作描述/), { target: { value: "计时描述" } });
  await screen.findByText("任务归属已确认");
  fireEvent.click(screen.getByRole("button", { name: "开始计时" }));
  await screen.findByText(/创建响应异常/);
  fireEvent.click(screen.getByRole("button", { name: "开始计时" }));
  await screen.findByText("提交中…");
  for (const name of ["取消", "关闭开始计时", "遮罩开始计时", "父层关闭", "提交中…"])
    fireEvent.click(screen.getByText(name));
  await act(async () => {
    view.router.history.push("/away");
  });
  expect(screen.queryByText("是否放弃修改？")).toBeNull();
  expect(workLogApi.startWork).toHaveBeenCalledTimes(2);
  await act(async () => reject(new Error("开始失败")));
  await screen.findByText("开始失败");
  fireEvent.click(screen.getByText("取消"));
  await screen.findByText("是否放弃修改？");
});
it("暂停失败保留状态，成功重读暂停后可完成，不存在恢复，运行允许离开", async () => {
  vi.mocked(workLogApi.getById).mockResolvedValue(
    workLogRecord({ startTime: "2020-01-01T00:00:00" }),
  );
  vi.mocked(workLogApi.pauseWork)
    .mockRejectedValueOnce(new Error("暂停失败"))
    .mockImplementationOnce(async () => {
      vi.mocked(workLogApi.getById).mockResolvedValue(
        workLogRecord({ status: "暂停", startTime: "2020-01-01T00:00:00" }),
      );
      return "ok";
    });
  const v = await renderWorkLogContent(
    <WorkLogTimerPanel id={11} projectId={7} disabled={false} onBusy={() => {}} />,
  );
  await screen.findByText(/参考计时/);
  fireEvent.click(screen.getByText("暂停"));
  await screen.findByText("暂停失败");
  expect(screen.getByText("暂停")).toBeTruthy();
  fireEvent.click(screen.getByText("暂停"));
  await waitFor(() => expect(screen.queryByText("暂停", { selector: "button" })).toBeNull());
  expect(screen.getByText("完成")).toBeTruthy();
  expect(screen.queryByText(/参考计时/)).toBeNull();
  expect(screen.queryByText("恢复")).toBeNull();
  fireEvent.click(screen.getByText("完成"));
  await waitFor(() => expect(workLogApi.completeWork).toHaveBeenCalledTimes(1));
  await act(async () => {
    v.router.history.push("/away");
  });
  await screen.findByText("已离开");
});
it("手工无 startTime/非法时间不 tick；终态无动作，卸载清理 interval", async () => {
  const spy = vi.spyOn(window, "setInterval");
  const clear = vi.spyOn(window, "clearInterval");
  const v = await renderWorkLogContent(
    <WorkLogTimerPanel id={11} projectId={7} disabled={false} onBusy={() => {}} />,
  );
  await screen.findByText("完成");
  expect(screen.queryByText(/参考计时/)).toBeNull();
  expect(spy.mock.calls.filter((call) => call[1] === 1000)).toHaveLength(0);
  vi.mocked(workLogApi.getById).mockResolvedValue(
    workLogRecord({ startTime: "2020-01-01T00:00:00" }),
  );
  await act(async () => {
    await v.client.invalidateQueries({ queryKey: ["hc", "workLog"] });
  });
  await screen.findByText(/参考计时/);
  const ticking = spy.mock.results[spy.mock.calls.findIndex((call) => call[1] === 1000)].value;
  v.unmount();
  expect(clear).toHaveBeenCalledWith(ticking);
});
it("fake timers 每秒仅刷新参考值，终态停止且不做轮询请求", async () => {
  const v = await renderWorkLogContent(
    <WorkLogTimerPanel id={11} projectId={7} disabled={false} onBusy={() => {}} />,
  );
  await screen.findByText("完成");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2020-01-01T00:00:10"));
  vi.mocked(workLogApi.getById).mockResolvedValue(
    workLogRecord({ startTime: "2020-01-01T00:00:00" }),
  );
  await act(async () => {
    await v.client.invalidateQueries({ queryKey: ["hc", "workLog"] });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByText(/参考计时/).textContent).toContain("10 秒");
  const calls = vi.mocked(workLogApi.getById).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByText(/参考计时/).textContent).toContain("12 秒");
  expect(workLogApi.getById).toHaveBeenCalledTimes(calls);
  vi.mocked(workLogApi.getById).mockResolvedValue(
    workLogRecord({
      status: "已完成",
      startTime: "2020-01-01T00:00:00",
      endTime: "2020-01-01T00:01:00",
    }),
  );
  await act(async () => {
    await v.client.invalidateQueries({ queryKey: ["hc", "workLog"] });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.queryByText(/参考计时/)).toBeNull();
  const finalCalls = vi.mocked(workLogApi.getById).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(workLogApi.getById).toHaveBeenCalledTimes(finalCalls);
  v.unmount();
  vi.useRealTimers();
});
it.each(["已完成", "已取消", "未知状态"])("%s 只读；不渲染暂停/完成/恢复", async (status) => {
  vi.mocked(workLogApi.getById).mockResolvedValue(
    workLogRecord({ status, startTime: "2020-01-01T00:00:00" }),
  );
  await renderWorkLogContent(
    <WorkLogTimerPanel id={11} projectId={7} disabled={false} onBusy={() => {}} />,
  );
  await screen.findByText(new RegExp(status));
  for (const name of ["暂停", "完成", "恢复"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByText(/参考计时/)).toBeNull();
});
