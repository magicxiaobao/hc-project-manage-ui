// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  mockWorkLogApis,
  renderWorkLogForm,
  workLogRecord,
  type FormKind,
} from "./worklog-test-support";
import { workLogApi } from "@/lib/api/worklog";
import { queryKeys } from "@/lib/query";
import { useAuthStore } from "@/lib/api/auth-store";
beforeEach(mockWorkLogApis);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
const description = () => screen.getByLabelText(/工作描述/);
async function fill() {
  fireEvent.change(screen.getByLabelText("关联任务（必填）"), { target: { value: "8" } });
  fireEvent.change(description(), { target: { value: "描述" } });
  fireEvent.change(screen.getByLabelText(/已用工时/), { target: { value: "1" } });
  await screen.findByText("任务归属已确认");
}
it("必填星号、OptionSelect 读屏名称、全部错误与首错焦点；编辑只清对应错误", async () => {
  await renderWorkLogForm("form");
  await screen.findByLabelText(/工作描述/);
  expect(screen.getByLabelText("工作类型（必填）")).toBeTruthy();
  for (const field of [/工作描述/, /已用工时/, /工作日期/])
    expect(screen.getByLabelText(field).previousElementSibling?.textContent).toContain("必填");
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getAllByRole("alert")).toHaveLength(3);
  expect(document.activeElement).toBe(screen.getByLabelText("关联任务（必填）"));
  fireEvent.change(description(), { target: { value: "描述" } });
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(workLogApi.createWorkLog).not.toHaveBeenCalled();
});
it("详情先加载，编辑归属/工作流只读，后台刷新不覆盖草稿，失败保留，成功重开布防", async () => {
  const view = await renderWorkLogForm("form", 11);
  await screen.findByLabelText(/工作描述/);
  await screen.findByText("任务归属已确认");
  expect((screen.getByLabelText(/关联任务/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText("工作类型（必填）") as HTMLSelectElement).value).toBe("未知类型");
  fireEvent.change(description(), { target: { value: "草稿" } });
  vi.mocked(workLogApi.getById).mockResolvedValue(workLogRecord({ workDescription: "刷新名称" }));
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: queryKeys.workLog.detail(11) });
  });
  expect((description() as HTMLTextAreaElement).value).toBe("草稿");
  vi.mocked(workLogApi.updateWorkLog).mockRejectedValueOnce(new Error("保存失败"));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText("保存失败");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.getByRole("dialog", { name: "是否放弃修改？" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "编辑工时" })).toBeNull());
  expect(workLogApi.updateWorkLog).toHaveBeenLastCalledWith({ id: 11, workDescription: "草稿" });
  fireEvent.click(screen.getByText("重新打开"));
  await screen.findByLabelText(/工作描述/);
  fireEvent.change(description(), { target: { value: "再次修改" } });
  fireEvent.click(screen.getByText("取消"));
  expect(screen.getByRole("dialog", { name: "是否放弃修改？" })).toBeTruthy();
});
it("编辑二次打开等待本次详情刷新，并用刷新值初始化", async () => {
  let resolve!: (record: ReturnType<typeof workLogRecord>) => void;
  vi.mocked(workLogApi.getById)
    .mockResolvedValueOnce(workLogRecord())
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
  await renderWorkLogForm("form", 11);
  expect(((await screen.findByLabelText(/工作描述/)) as HTMLTextAreaElement).value).toBe("原描述");
  fireEvent.click(screen.getByText("取消"));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByText("重新打开"));
  await waitFor(() => expect(workLogApi.getById).toHaveBeenCalledTimes(2));
  expect(screen.queryByLabelText(/工作描述/)).toBeNull();
  expect(screen.getByText("正在加载详情…")).toBeTruthy();
  await act(async () =>
    resolve(
      workLogRecord({
        workDescription: "新描述",
        workType: "设计",
        workLocation: "远程",
      }),
    ),
  );
  expect(((await screen.findByLabelText(/工作描述/)) as HTMLTextAreaElement).value).toBe("新描述");
  expect((screen.getByLabelText("工作类型（必填）") as HTMLSelectElement).value).toBe("设计");
  expect((screen.getByLabelText("地点") as HTMLSelectElement).value).toBe("远程");
  fireEvent.click(screen.getByText("取消"));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it.each(["计费", "加班"])("原值 null 的%s重选未设置不产生 dirty", async (label) => {
  vi.mocked(workLogApi.getById).mockResolvedValue(
    workLogRecord({ isBillable: null, isOvertime: null }),
  );
  await renderWorkLogForm("form", 11);
  await screen.findByLabelText(/工作描述/);
  const select = screen.getByLabelText(label) as HTMLSelectElement;
  expect(select.value).toBe("");
  fireEvent.change(select, { target: { value: "" } });
  fireEvent.click(screen.getByText("取消"));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("新建任务、工作类型和地点下拉通过 aria-labelledby 关联字段标签", async () => {
  await renderWorkLogForm("form");
  await screen.findByLabelText(/工作描述/);
  for (const [name, label] of [
    ["taskId", "关联任务（必填）"],
    ["workType", "工作类型（必填）"],
    ["workLocation", "地点"],
  ]) {
    const control = screen.getByRole("combobox", { name: label });
    expect(control.getAttribute("aria-labelledby")).toBe(`worklog-${name}-label`);
    expect(document.getElementById(`worklog-${name}-label`)?.hasAttribute("for")).toBe(false);
  }
});
it("零返回不清草稿，不自动调用 start；合法登记只一次 create", async () => {
  vi.mocked(workLogApi.createWorkLog).mockResolvedValueOnce(0);
  await renderWorkLogForm("form");
  await screen.findByLabelText(/工作描述/);
  await fill();
  fireEvent.click(screen.getByText("保存"));
  await screen.findByText(/创建响应异常/);
  expect((description() as HTMLTextAreaElement).value).toBe("描述");
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "登记工时" })).toBeNull());
  expect(workLogApi.startWork).not.toHaveBeenCalled();
});
it.each(["form", "start", "approval", "import"] as FormKind[])(
  "%s 所有主动离开入口先确认，放弃/重开布防/改回 clean",
  async (kind) => {
    vi.mocked(workLogApi.getById).mockResolvedValue(workLogRecord({ userId: 99 }));
    await renderWorkLogForm(kind);
    const input = () =>
      kind === "import"
        ? screen.getByLabelText(/导入内容/)
        : kind === "approval"
          ? screen.getByLabelText(/审批意见/)
          : description();
    await waitFor(() => expect(input()).toBeTruthy());
    const baseline = (input() as HTMLTextAreaElement).value;
    const title = {
      form: "登记工时",
      start: "开始计时",
      approval: "工时审批",
      import: "批量导入工时",
    }[kind];
    for (const trigger of [`关闭${title}`, `遮罩${title}`, "取消", "Esc", "父层关闭"]) {
      fireEvent.change(input(), { target: { value: "草稿" } });
      trigger === "Esc"
        ? fireEvent.keyDown(document, { key: "Escape" })
        : fireEvent.click(screen.getByText(trigger));
      expect(screen.getByRole("dialog", { name: "是否放弃修改？" })).toBeTruthy();
      fireEvent.click(screen.getByText("继续编辑"));
      expect((input() as HTMLTextAreaElement).value).toBe("草稿");
    }
    fireEvent.click(screen.getByText("取消"));
    fireEvent.click(screen.getByText("放弃修改"));
    expect(screen.queryByRole("dialog", { name: title })).toBeNull();
    fireEvent.click(screen.getByText("重新打开"));
    await waitFor(() => expect(input()).toBeTruthy());
    fireEvent.change(input(), { target: { value: "重新布防" } });
    fireEvent.click(screen.getByText("父层关闭"));
    expect(screen.getByRole("dialog", { name: "是否放弃修改？" })).toBeTruthy();
    fireEvent.click(screen.getByText("继续编辑"));
    fireEvent.change(input(), { target: { value: baseline } });
    fireEvent.click(screen.getByText("取消"));
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
it.each(["form", "start", "approval", "import"] as FormKind[])(
  "%s 路由离开确认且待决时不能提交",
  async (kind) => {
    vi.mocked(workLogApi.getById).mockResolvedValue(workLogRecord({ userId: 99 }));
    const view = await renderWorkLogForm(kind);
    const input = await screen.findByLabelText(
      kind === "import" ? /导入内容/ : kind === "approval" ? /审批意见/ : /工作描述/,
    );
    fireEvent.change(input, { target: { value: "路由草稿" } });
    await act(async () => {
      view.router.history.push("/away");
    });
    await screen.findByRole("dialog", { name: "是否放弃修改？" });
    fireEvent.click(
      screen.getByRole("button", {
        name:
          kind === "form"
            ? "保存"
            : kind === "start"
              ? "开始计时"
              : kind === "approval"
                ? "确认审批"
                : "导入",
      }),
    );
    expect(workLogApi.createWorkLog).not.toHaveBeenCalled();
    expect(workLogApi.startWork).not.toHaveBeenCalled();
    expect(workLogApi.approveWorkLog).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("继续编辑"));
    expect(view.router.state.location.pathname).toBe("/form");
    await act(async () => {
      view.router.history.push("/away");
    });
    await screen.findByText("放弃修改");
    fireEvent.click(screen.getByText("放弃修改"));
    await screen.findByText("已离开");
  },
);
it.each(["form", "start", "approval", "import"] as FormKind[])(
  "%s 浏览器后退保护草稿",
  async (kind) => {
    vi.mocked(workLogApi.getById).mockResolvedValue(workLogRecord({ userId: 99 }));
    const view = await renderWorkLogForm(kind, undefined, true);
    const input = await screen.findByLabelText(
      kind === "import" ? /导入内容/ : kind === "approval" ? /审批意见/ : /工作描述/,
    );
    fireEvent.change(input, { target: { value: "后退草稿" } });
    view.router.history.back();
    await screen.findByText("继续编辑");
    fireEvent.click(screen.getByText("继续编辑"));
    await waitFor(() => expect(window.location.pathname).toBe("/form"));
    view.router.history.back();
    await screen.findByText("放弃修改");
    fireEvent.click(screen.getByText("放弃修改"));
    await screen.findByText("已离开");
    view.router.history.destroy();
  },
);
it("dirty + pending 直接拒绝路由/后退/全部关闭与重复提交，失败恢复 dirty", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(workLogApi.createWorkLog).mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const view = await renderWorkLogForm("form", undefined, true);
  await screen.findByLabelText(/工作描述/);
  await fill();
  fireEvent.click(screen.getByText("保存"));
  await screen.findByText("提交中…");
  expect((description().closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  for (const name of ["提交中…", "取消", "关闭登记工时", "遮罩登记工时", "父层关闭"])
    fireEvent.click(screen.getByText(name));
  fireEvent.keyDown(document, { key: "Escape" });
  await act(async () => {
    view.router.history.push("/away");
  });
  await act(async () => {
    view.router.history.back();
  });
  await waitFor(() => expect(window.location.pathname).toBe("/form"));
  expect(screen.queryByText("是否放弃修改？")).toBeNull();
  expect(view.router.state.location.pathname).toBe("/form");
  expect(workLogApi.createWorkLog).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("请求失败")));
  await screen.findByText("请求失败");
  await act(async () => {
    view.router.history.push("/away");
  });
  await screen.findByText("是否放弃修改？");
  fireEvent.click(screen.getByText("继续编辑"));
  view.router.history.destroy();
});
