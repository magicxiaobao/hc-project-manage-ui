// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardDetail, renderDashboardForm } from './dashboard-test-support';
import { dashboardApi } from '@/lib/api/dashboard';
import { useAuthStore } from '@/lib/api/auth-store';
import { queryKeys } from '@/lib/query';

beforeEach(() => { useAuthStore.setState({ isAuthenticated: true }); vi.spyOn(dashboardApi, 'getById').mockResolvedValue(dashboardDetail()); vi.spyOn(dashboardApi, 'createDashboard').mockResolvedValue(7); vi.spyOn(dashboardApi, 'updateDashboard').mockResolvedValue('ok'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); useAuthStore.setState({ isAuthenticated: false }); });
const name = () => screen.getByLabelText(/仪表盘名称/);
describe('DashboardForm 对话框', () => {
  it('必填星号/全量字段错误/首错焦点，编辑只清该字段错误', async () => {
    await renderDashboardForm('dashboard'); await screen.findByLabelText(/仪表盘名称/);
    fireEvent.change(screen.getByLabelText('排序值'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('自动刷新设置'), { target: { value: 'true' } });
    fireEvent.change(screen.getByLabelText(/刷新间隔/), { target: { value: '0' } });
    expect(screen.getByLabelText(/刷新间隔/).previousElementSibling?.textContent).toContain('必填');
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getAllByRole('alert')).toHaveLength(3); expect(document.activeElement).toBe(name());
    expect(name().parentElement?.querySelector('[role=alert]')?.textContent).toContain('不能为空');
    fireEvent.change(name(), { target: { value: '有效名称' } });
    expect(screen.getAllByRole('alert')).toHaveLength(2); expect(dashboardApi.createDashboard).not.toHaveBeenCalled();
  });
  it.each(['关闭新建仪表盘', '遮罩新建仪表盘', '取消', 'Esc', '父层关闭'])('%s 统一确认，继续编辑保留，放弃关闭，再打开重新布防', async trigger => {
    await renderDashboardForm('dashboard'); await screen.findByLabelText(/仪表盘名称/);
    fireEvent.change(name(), { target: { value: '草稿' } });
    const close = () => trigger === 'Esc' ? fireEvent.keyDown(document, { key: 'Escape' }) : fireEvent.click(screen.getByRole('button', { name: trigger }));
    close(); expect(screen.getByRole('dialog', { name: '是否放弃修改？' })).toBeTruthy();
    close(); expect(screen.getAllByRole('dialog', { name: '是否放弃修改？' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' })); expect((name() as HTMLInputElement).value).toBe('草稿');
    close(); fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
    expect(screen.queryByRole('dialog', { name: '新建仪表盘' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新打开' })); await screen.findByLabelText(/仪表盘名称/);
    fireEvent.change(name(), { target: { value: '新的草稿' } }); close();
    expect(screen.getByRole('dialog', { name: '是否放弃修改？' })).toBeTruthy();
  });
  it('改回快照即 clean，取消直接关闭', async () => {
    await renderDashboardForm('dashboard'); await screen.findByLabelText(/仪表盘名称/);
    fireEvent.change(name(), { target: { value: '草稿' } }); fireEvent.change(name(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' })); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('编辑等待详情，后台 refetch 不覆盖草稿，失败仍 dirty，成功关闭再次打开布防', async () => {
    const view = await renderDashboardForm('dashboard', 7); await screen.findByLabelText(/仪表盘名称/);
    expect((screen.getByLabelText('仪表盘类型') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(name(), { target: { value: '修改名称' } });
    vi.mocked(dashboardApi.getById).mockResolvedValue(dashboardDetail({ dashboardName: '后台名称' }));
    await act(async () => { await view.client.invalidateQueries({ queryKey: queryKeys.dashboard.detail(7) }); });
    expect((name() as HTMLInputElement).value).toBe('修改名称');
    vi.mocked(dashboardApi.updateDashboard).mockRejectedValueOnce(new Error('保存失败'));
    fireEvent.click(screen.getByRole('button', { name: '保存' })); await screen.findByText('保存失败');
    fireEvent.click(screen.getByRole('button', { name: '取消' })); expect(screen.getByRole('dialog', { name: '是否放弃修改？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' })); await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑仪表盘' })).toBeNull());
    expect(dashboardApi.updateDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ id: 7, dashboardName: '修改名称' }));
    expect(vi.mocked(dashboardApi.updateDashboard).mock.calls[0][0]).not.toHaveProperty('projectId');
    fireEvent.click(screen.getByRole('button', { name: '重新打开' })); await screen.findByLabelText(/仪表盘名称/);
    fireEvent.change(name(), { target: { value: '再次修改' } }); fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByRole('dialog', { name: '是否放弃修改？' })).toBeTruthy();
  });
  it('pending 防重复、输入禁用与所有关闭入口无效', async () => {
    let resolve!: (id: number) => void; vi.mocked(dashboardApi.createDashboard).mockImplementation(() => new Promise(done => { resolve = done; }));
    await renderDashboardForm('dashboard'); await screen.findByLabelText(/仪表盘名称/); fireEvent.change(name(), { target: { value: '保存中' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' })); await waitFor(() => expect(screen.getByRole('button', { name: '保存中…' })).toBeTruthy());
    expect((name() as HTMLInputElement).closest('fieldset')?.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '保存中…' })); fireEvent.click(screen.getByRole('button', { name: '关闭新建仪表盘' })); fireEvent.keyDown(document, { key: 'Escape' }); fireEvent.click(screen.getByRole('button', { name: '父层关闭' }));
    expect(screen.getByRole('dialog', { name: '新建仪表盘' })).toBeTruthy(); expect(dashboardApi.createDashboard).toHaveBeenCalledTimes(1);
    await act(async () => resolve(7)); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('路由跳转由独立 blocker 处理', async () => {
    const view = await renderDashboardForm('dashboard'); await screen.findByLabelText(/仪表盘名称/); fireEvent.change(name(), { target: { value: '路由草稿' } });
    await act(async () => { view.router.history.push('/away'); });
    await screen.findByRole('dialog', { name: '是否放弃修改？' });
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    expect(view.router.state.location.pathname).toBe('/form');
    await act(async () => { view.router.history.push('/away'); }); await screen.findByRole('dialog', { name: '是否放弃修改？' });
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' })); await screen.findByText('已离开');
  });
  it('浏览器后退由独立 blocker 处理', async () => {
    const view = await renderDashboardForm('dashboard', undefined, true); await screen.findByLabelText(/仪表盘名称/); fireEvent.change(name(), { target: { value: '后退草稿' } });
    view.router.history.back(); await screen.findByRole('dialog', { name: '是否放弃修改？' });
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' })); await waitFor(() => expect(window.location.pathname).toBe('/form'));
    view.router.history.back(); await screen.findByRole('dialog', { name: '是否放弃修改？' });
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' })); await screen.findByText('已离开'); view.router.history.destroy();
  });
});
