import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { AppModal } from '@/components/biz/app-modal';
import { useDashboardConfig, useDashboardDetail } from '@/lib/query';
import { dashboardConfigState } from '@/lib/dashboard-config-state';
import { DashboardWidgetSection } from './dashboard-widget-section';
import { DashboardQueryError, DashboardReadonly } from './dashboard-list-controls';
import type { LeaveHandle } from './dashboard-form-fields';

export const DashboardConfigDialog = forwardRef<LeaveHandle, { open: boolean; dashboardId: number | null; projectId: number | null; onClose: () => void }>(function DashboardConfigDialog({ open, dashboardId, projectId, onClose }, ref) {
  const config = useDashboardConfig(dashboardId, open);
  const parent = useDashboardDetail(dashboardId, open);
  const widgetRef = useRef<LeaveHandle>(null);
  const [widgetContainer, setWidgetContainer] = useState<HTMLDivElement | null>(null);
  const leave = (next: () => void) => { if (widgetRef.current) widgetRef.current.requestLeave(next); else next(); };
  useImperativeHandle(ref, () => ({ requestLeave: leave }));
  const state = dashboardConfigState(config.data, dashboardId ?? 0);
  const parentMatches = parent.data?.id === dashboardId && parent.data?.projectId === projectId;
  return <><AppModal open={open} title="仪表盘配置与小部件" onClose={() => leave(onClose)} size="cover">
    <div className="mx-auto flex max-w-5xl flex-col gap-3">
      <Button variant="ghost" isDisabled={config.isFetching} onPress={() => void config.refetch()}>重新读取配置</Button>
      {/* B3: DashboardServiceImpl.getDashboardConfig 从实体 JSON 读取，不读取 widget 表。
          layout.id 是 String，无已确认 widget ID 映射；顶层设置与嵌套设置也不保证同步。 */}
      <p className="text-sm text-default-500">配置按服务端原文展示。布局 ID 与小部件 ID 的关联尚未确认；小部件变更及仪表盘顶层设置不保证同步到以下配置。</p>
      {config.isFetching ? <p>{config.data ? '正在刷新配置…' : '正在加载配置…'}</p> : null}
      {config.isError ? <DashboardQueryError error={config.error} hasData={!!config.data} refreshing={config.isFetching} retry={() => void config.refetch()} /> : null}
      {config.isSuccess && state.kind === 'error' ? <div role="alert" className="text-danger">{state.message}<Button variant="ghost" onPress={() => void config.refetch()}>重试配置</Button></div> : null}
      {state.kind === 'ready' ? <>
        <p>{state.config.dashboardName ?? '未命名'} · {state.config.dashboardType ?? '未设置'}</p>
        <p>{state.config.layout === null ? '未提供布局' : state.config.layout.length === 0 ? '暂无布局项' : `布局项：${state.config.layout.length}`}</p>
        {(['layout', 'theme', 'refresh', 'permissions', 'customConfig'] as const).map(key => <DashboardReadonly key={key} label={({ layout: '布局', theme: '主题', refresh: '刷新', permissions: '权限配置（仅数据）', customConfig: '自定义配置' })[key]} value={state.config[key]} />)}
      </> : null}
      {parent.isFetching ? <p>正在核对所属仪表盘…</p> : null}
      {parent.isError ? <DashboardQueryError error={parent.error} hasData={!!parent.data} retry={() => void parent.refetch()} /> : null}
      {parent.isSuccess && !parentMatches ? <p role="alert">父仪表盘详情或所属项目异常，不能管理小部件</p> : null}
      <div ref={setWidgetContainer} />
    </div>
  </AppModal>
    {/* 只把管理列表 portal 到配置内容；表单和 blocker 始终留在 AppModal 外。 */}
    <DashboardWidgetSection ref={widgetRef} dashboardId={dashboardId ?? 0} open={open && parentMatches} container={parentMatches ? widgetContainer : null} />
  </>;
});
