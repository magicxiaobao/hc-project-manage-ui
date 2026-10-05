// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderDashboardForm, widgetDetail } from './dashboard-test-support';
import { dashboardWidgetApi } from '@/lib/api/dashboard';
import { useAuthStore } from '@/lib/api/auth-store';

beforeEach(() => { useAuthStore.setState({ isAuthenticated: true }); vi.spyOn(dashboardWidgetApi, 'getById').mockResolvedValue(widgetDetail()); vi.spyOn(dashboardWidgetApi, 'createDashboardWidget').mockResolvedValue(11); vi.spyOn(dashboardWidgetApi, 'updateDashboardWidget').mockResolvedValue('ok'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); useAuthStore.setState({ isAuthenticated: false }); });
describe('WidgetForm 对话框', () => {
  it('必填名称/尺寸、JSON 错误同时显示，编辑仅清该字段', async () => {
    await renderDashboardForm('widget'); await screen.findByLabelText(/小部件名称/);
    fireEvent.change(screen.getByLabelText(/宽度/), { target: { value: '0' } }); fireEvent.change(screen.getByLabelText(/高度/), { target: { value: '' } }); fireEvent.change(screen.getByLabelText('配置 JSON'), { target: { value: '[]' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' })); expect(screen.getAllByRole('alert')).toHaveLength(4);
    expect(document.activeElement).toBe(screen.getByLabelText(/小部件名称/));
    expect(screen.getByLabelText(/宽度/).parentElement?.querySelector('[role=alert]')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('配置 JSON'), { target: { value: '{}' } }); expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(dashboardWidgetApi.createDashboardWidget).not.toHaveBeenCalled();
  });
  it.each(['关闭新建小部件', '遮罩新建小部件', '取消', 'Esc', '父层关闭'])('%s 通过守卫才关闭', async trigger => {
    await renderDashboardForm('widget'); await screen.findByLabelText(/小部件名称/); fireEvent.change(screen.getByLabelText(/小部件名称/), { target: { value: '草稿' } });
    if (trigger === 'Esc') fireEvent.keyDown(document, { key: 'Escape' }); else fireEvent.click(screen.getByRole('button', { name: trigger }));
    expect(screen.getByRole('dialog', { name: '是否放弃修改？' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' })); expect((screen.getByLabelText(/小部件名称/) as HTMLInputElement).value).toBe('草稿');
    fireEvent.click(screen.getByRole('button', { name: '取消' })); fireEvent.click(screen.getByRole('button', { name: '放弃修改' })); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('坏配置回填保留原文并立即报错，修正后白名单保存', async () => {
    vi.mocked(dashboardWidgetApi.getById).mockResolvedValue(widgetDetail({ widgetConfig: '{bad', width: null }));
    await renderDashboardForm('widget', 11); await screen.findByLabelText(/小部件名称/);
    expect((screen.getByLabelText('配置 JSON') as HTMLTextAreaElement).value).toBe('{bad'); expect(screen.getByLabelText('配置 JSON').parentElement?.querySelector('[role=alert]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '保存' })); expect(dashboardWidgetApi.updateDashboardWidget).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/宽度/), { target: { value: '8' } }); fireEvent.change(screen.getByLabelText('配置 JSON'), { target: { value: '{"a":false}' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(dashboardWidgetApi.updateDashboardWidget).toHaveBeenCalledWith({ id: 11, widgetName: '原小部件', widgetTitle: undefined, widgetType: '未知类型', dataSource: undefined, widgetConfig: '{"a":false}', positionX: undefined, positionY: undefined, width: 8, height: 4, sortOrder: undefined, isVisible: undefined });
  });
  it('父归属错误和详情失败不能保存，也不使用旧列表数据', async () => {
    vi.mocked(dashboardWidgetApi.getById).mockResolvedValue(widgetDetail({ dashboardId: 99 }));
    await renderDashboardForm('widget', 11); await screen.findByText(/详情所属仪表盘或 ID 异常/);
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true); expect(screen.queryByLabelText(/小部件名称/)).toBeNull();
  });
});
