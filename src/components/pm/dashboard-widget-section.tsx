import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react';
import { AppModal } from '@/components/biz/app-modal';
import { useDashboardWidgetDetail, useDashboardWidgetList, useInvalidDashboardWidget, useValidDashboardWidget } from '@/lib/query';
import { validId } from '@/lib/dashboard-form';
import { DashboardWidgetForm } from './dashboard-widget-form-dialog';
import { DashboardActionDialog, DashboardPagination, DashboardQueryError, DashboardReadonly } from './dashboard-list-controls';
import type { LeaveHandle } from './dashboard-form-fields';

export const DashboardWidgetSection = forwardRef<LeaveHandle, { dashboardId: number; open: boolean; container: HTMLElement | null }>(function DashboardWidgetSection({ dashboardId, open, container }, ref) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(12);
  const [form, setForm] = useState<{ id?: number } | null>(null); const formRef = useRef<LeaveHandle>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [action, setAction] = useState<{ id: number; name: string; invalid: boolean; widget: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const list = useDashboardWidgetList({ dashboardId, page, pageSize }, open);
  const detail = useDashboardWidgetDetail(viewId, open && viewId !== null);
  const valid = useValidDashboardWidget(dashboardId); const invalid = useInvalidDashboardWidget(dashboardId);
  useImperativeHandle(ref, () => ({ requestLeave: next => {
    if (valid.isPending || invalid.isPending) return;
    const leave = () => { setForm(null); setViewId(null); setAction(null); next(); };
    if (form) formRef.current?.requestLeave(leave); else leave();
  } }));
  useEffect(() => { if (list.data && page > Math.max(1, Math.ceil(list.data.total / pageSize))) setPage(Math.max(1, Math.ceil(list.data.total / pageSize))); }, [list.data, page, pageSize]);
  useEffect(() => { if (!open) { setForm(null); setViewId(null); setAction(null); } }, [open]);
  const locked = form !== null || action !== null;
  return <>
    {container ? createPortal(<section className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">小部件管理</h3><Button variant="secondary" isDisabled={locked || !validId(dashboardId)} onPress={() => setForm({})}>新建小部件</Button></div>
    <p className="text-sm text-default-500">隐藏项保留在管理列表。小部件变更后会重新读取配置，当前后端未将小部件表同步到配置布局。</p>
    {notice ? <p role="status">{notice}</p> : null}
    {list.isFetching ? <p>{list.data ? '正在刷新小部件…' : '正在加载小部件…'}</p> : null}
    {list.isError ? <DashboardQueryError error={list.error} retry={() => void list.refetch()} refreshing={list.isFetching} hasData={!!list.data} /> : null}
    {list.data?.list.length === 0 ? <p>暂无小部件</p> : null}
    {list.data?.list.map(widget => <div key={widget.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-3 text-sm">
      <div className="min-w-40 flex-1"><strong>{widget.widgetName ?? '未命名'}</strong><p>#{widget.id} · {widget.widgetType ?? '未设置'} · {widget.isVisible === null ? '可见性未设置' : widget.isVisible ? '可见' : '隐藏'}</p><p>位置 {widget.positionX ?? '未设置'}/{widget.positionY ?? '未设置'} · 宽高 {widget.width ?? '未设置'}/{widget.height ?? '未设置'}</p></div>
      <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setViewId(widget.id)}>详情</Button>
      <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setForm({ id: widget.id })}>编辑</Button>
      <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setAction({ id: widget.id, name: widget.widgetName ?? String(widget.id), invalid: false, widget: true })}>启用</Button>
      <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setAction({ id: widget.id, name: widget.widgetName ?? String(widget.id), invalid: true, widget: true })}>删除入口（隐藏）</Button>
    </div>)}
    {list.data ? <DashboardPagination page={page} pageSize={pageSize} total={list.data.total} disabled={locked || list.isFetching} onPage={setPage} onSize={size => { setPageSize(size); setPage(1); }} /> : null}
    </section>, container) : null}
    {/* 表单与 blocker 在父 AppModal 外稳定挂载，父弹窗的关闭只移除展示容器。 */}
    <DashboardWidgetForm ref={formRef} open={open && form !== null} dashboardId={dashboardId} id={form?.id} onClose={() => setForm(null)} onSaved={() => setNotice('已保存，正在重新读取小部件与配置。')} />
    <DashboardActionDialog target={action} onClose={() => setAction(null)} run={() => action!.invalid ? invalid.mutateAsync(action!.id) : valid.mutateAsync(action!.id)} onSuccess={() => setNotice(action?.invalid ? '小部件已隐藏，正在重取。' : '小部件已启用，正在重取。')} />
    <AppModal open={viewId !== null} title="小部件详情" onClose={() => setViewId(null)}>
      {detail.isFetching ? <p>正在加载详情…</p> : null}
      {detail.isError ? <DashboardQueryError error={detail.error} retry={() => void detail.refetch()} hasData={!!detail.data} /> : null}
      {detail.data && detail.data.id === viewId && detail.data.dashboardId === dashboardId ? <DashboardReadonly label="真实小部件详情（含配置原文）" value={detail.data} /> : detail.isSuccess ? <p role="alert">详情所属仪表盘或 ID 异常</p> : null}
    </AppModal>
  </>;
});
