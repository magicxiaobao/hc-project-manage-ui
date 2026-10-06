// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mockWorkLogApis, renderWorkLogForm, workLogRecord } from "./worklog-test-support";
import { workLogApi } from "@/lib/api/worklog";
import { useAuthStore } from "@/lib/api/auth-store";
beforeEach(mockWorkLogApis);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
it("自审禁用并字段下报错；非法身份与记录上下文收集全部错误", async () => {
  const v = await renderWorkLogForm("approval");
  await screen.findAllByText("不能审批自己的工时记录");
  expect((screen.getByText("确认审批") as HTMLButtonElement).disabled).toBe(true);
  expect(workLogApi.approveWorkLog).not.toHaveBeenCalled();
  v.unmount();
  useAuthStore.setState({
    user: {
      userId: "bad",
      userName: "异常",
      roles: [],
      cnName: null,
      extraInfo: {},
      authorities: [],
    },
  });
  vi.mocked(workLogApi.getById).mockRejectedValue(new Error("不存在"));
  await renderWorkLogForm("approval");
  await screen.findByText("不存在");
  fireEvent.click(screen.getByText("确认审批"));
  expect(
    screen
      .getByText("当前登录身份无效，请重新登录")
      .closest("[data-field]")
      ?.getAttribute("data-field"),
  ).toBe("approverId");
  expect(
    screen.getByText("记录不存在或归属未确认").closest("[data-field]")?.getAttribute("data-field"),
  ).toBe("record");
});
it("独立账号通过/驳回传当前身份与选填意见，模式切换 dirty，成功重开布防", async () => {
  vi.mocked(workLogApi.getById).mockResolvedValue(workLogRecord({ userId: 99 }));
  await renderWorkLogForm("approval");
  await screen.findByText(/原描述/);
  fireEvent.change(screen.getByLabelText("审批操作"), { target: { value: "reject" } });
  fireEvent.click(screen.getByText("取消"));
  await screen.findByText("是否放弃修改？");
  fireEvent.click(screen.getByText("继续编辑"));
  fireEvent.click(screen.getByText("确认审批"));
  await waitFor(() =>
    expect(workLogApi.rejectWorkLog).toHaveBeenCalledWith(11, { approverId: 42, comment: "" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "工时审批" })).toBeNull());
  fireEvent.click(screen.getByText("重新打开"));
  await screen.findByLabelText(/审批意见/);
  fireEvent.change(screen.getByLabelText(/审批意见/), { target: { value: "中文 & + #" } });
  fireEvent.click(screen.getByText("确认审批"));
  await waitFor(() =>
    expect(workLogApi.approveWorkLog).toHaveBeenCalledWith(11, {
      approverId: 42,
      comment: "中文 & + #",
    }),
  );
});
it("审批 pending 拒绝导航/重复/关闭，失败保留意见并恢复 dirty", async () => {
  vi.mocked(workLogApi.getById).mockResolvedValue(workLogRecord({ userId: 99 }));
  let reject!: (e: Error) => void;
  vi.mocked(workLogApi.approveWorkLog).mockImplementation(
    () =>
      new Promise((_r, fail) => {
        reject = fail;
      }),
  );
  const v = await renderWorkLogForm("approval");
  await screen.findByText(/原描述/);
  fireEvent.change(screen.getByLabelText(/审批意见/), { target: { value: "保留意见" } });
  fireEvent.click(screen.getByText("确认审批"));
  await screen.findByText("提交中…");
  for (const name of ["取消", "关闭工时审批", "遮罩工时审批", "父层关闭", "提交中…"])
    fireEvent.click(screen.getByText(name));
  fireEvent.keyDown(document, { key: "Escape" });
  await act(async () => {
    v.router.history.push("/away");
  });
  expect(screen.queryByText("是否放弃修改？")).toBeNull();
  expect(workLogApi.approveWorkLog).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("审批失败")));
  await screen.findByText("审批失败");
  expect((screen.getByLabelText(/审批意见/) as HTMLTextAreaElement).value).toBe("保留意见");
  fireEvent.click(screen.getByText("取消"));
  await screen.findByText("是否放弃修改？");
});
