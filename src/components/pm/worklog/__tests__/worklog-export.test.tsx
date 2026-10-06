// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mockWorkLogApis, renderWorkLogContent } from "./worklog-test-support";
import { WorkLogListPage } from "../../worklog-list-page";
import { workLogApi } from "@/lib/api/worklog";
import { useAuthStore } from "@/lib/api/auth-store";
beforeEach(mockWorkLogApis);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});
async function page() {
  const v = await renderWorkLogContent(<WorkLogListPage />);
  await waitFor(() =>
    expect(screen.getByLabelText("项目").querySelector('option[value="7"]')).toBeTruthy(),
  );
  fireEvent.change(screen.getByLabelText("项目"), { target: { value: "7" } });
  await screen.findByText("原描述");
  return v;
}
it.each([null, undefined, { url: "/fake", filename: "fake.xlsx" }])(
  "导出响应 %j 不生成文件，使用已应用筛选而非草稿",
  async (response) => {
    vi.mocked(workLogApi.exportWorkLogs).mockResolvedValue(response);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    await page();
    fireEvent.change(screen.getByLabelText("用户 ID"), { target: { value: "55" } });
    fireEvent.click(screen.getByText("搜索"));
    await waitFor(() =>
      expect(workLogApi.findByPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ bean: { projectId: 7, userId: 55 } }),
      ),
    );
    await screen.findByText("原描述");
    fireEvent.change(screen.getByLabelText("用户 ID"), { target: { value: "66" } });
    fireEvent.click(screen.getByText("请求导出"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("导出暂不可用"));
    expect(workLogApi.exportWorkLogs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      bean: { projectId: 7, userId: 55 },
    });
    expect(click).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
  },
);
it("导出快照在途锁项目/搜索/分页/双击，失败恢复；只读导出可离开", async () => {
  let reject!: (e: Error) => void;
  vi.mocked(workLogApi.exportWorkLogs).mockImplementation(
    () =>
      new Promise((_r, fail) => {
        reject = fail;
      }),
  );
  const v = await page();
  fireEvent.click(screen.getByText("请求导出"));
  await screen.findByText("正在请求导出…");
  for (const label of ["项目", "用户 ID", "每页条数"])
    expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
  for (const button of ["搜索", "请求导出", "记录下一页"])
    expect((screen.getByText(button) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("请求导出"));
  fireEvent.click(screen.getByText("搜索"));
  expect(workLogApi.exportWorkLogs).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("网络失败")));
  await screen.findByText("导出暂不可用：网络失败");
  expect((screen.getByLabelText("项目") as HTMLInputElement).disabled).toBe(false);
  await act(async () => {
    v.router.history.push("/away");
  });
  await screen.findByText("已离开");
});
