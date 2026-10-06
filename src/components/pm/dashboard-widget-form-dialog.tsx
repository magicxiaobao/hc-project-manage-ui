import { forwardRef } from 'react';
import { RequiredMark } from '@/components/biz/form-guard';
import { buildWidgetCreatePayload, buildWidgetUpdatePayload, validateWidgetForm, widgetInitial, widgetConfigError, type DashboardWidgetFormInput } from '@/lib/dashboard-widget-form';
import { useCreateDashboardWidget, useDashboardWidgetDetail, useUpdateDashboardWidget, toUserMessage } from '@/lib/query';
import { DashboardFormFields, type DashboardField, type Draft, type LeaveHandle } from './dashboard-form-fields';

const fields: DashboardField[] = [
  { name: 'widgetName', label: '小部件名称', required: true }, { name: 'widgetTitle', label: '标题' },
  { name: 'widgetType', label: '类型', hint: '建议 card / chart，支持服务端其他值。' }, { name: 'dataSource', label: '数据源', hint: '仅保存标识，不执行数据源。' },
  { name: 'widgetConfig', label: '配置 JSON', kind: 'textarea', hint: '非空时必须为 JSON 对象。' },
  { name: 'positionX', label: '位置 X', kind: 'integer' }, { name: 'positionY', label: '位置 Y', kind: 'integer' },
  { name: 'width', label: '宽度', kind: 'integer', required: true }, { name: 'height', label: '高度', kind: 'integer', required: true },
  { name: 'sortOrder', label: '排序值', kind: 'integer' }, { name: 'isVisible', label: '可见', kind: 'boolean' },
];
export const DashboardWidgetForm = forwardRef<LeaveHandle, { open: boolean; dashboardId: number; id?: number; onClose: () => void; onSaved: () => void }>(function DashboardWidgetForm({ open, dashboardId, id, onClose, onSaved }, ref) {
  const detail = useDashboardWidgetDetail(id, open && id !== undefined);
  const create = useCreateDashboardWidget(dashboardId); const update = useUpdateDashboardWidget(dashboardId);
  const matching = detail.data?.id === id && detail.data?.dashboardId === dashboardId;
  const initial = id === undefined ? widgetInitial() : matching && !detail.isFetching ? widgetInitial(detail.data) : null;
  return <DashboardFormFields ref={ref} open={open} title={id === undefined ? '新建小部件' : '编辑小部件'} initial={initial as unknown as Draft | null} fields={fields}
    loading={id !== undefined && detail.isFetching} loadError={detail.isError ? toUserMessage(detail.error) : detail.isSuccess && !matching ? '详情所属仪表盘或 ID 异常，不能编辑' : undefined} retry={() => void detail.refetch()}
    context={<div className="text-sm"><p>所属仪表盘{ id === undefined ? <RequiredMark /> : null}：{dashboardId}</p><p className="text-default-500">位置和尺寸的网格单位、边界待联调确认。</p>{id !== undefined && detail.data && widgetConfigError(detail.data.widgetConfig) ? <p role="alert" className="text-danger">原配置有误：{widgetConfigError(detail.data.widgetConfig)}，请修正后保存。</p> : null}</div>}
    validate={draft => validateWidgetForm(draft as unknown as DashboardWidgetFormInput, dashboardId, id)}
    save={draft => id === undefined ? create.mutateAsync(buildWidgetCreatePayload(draft as unknown as DashboardWidgetFormInput, dashboardId)) : update.mutateAsync(buildWidgetUpdatePayload(draft as unknown as DashboardWidgetFormInput, id))}
    onClose={onClose} onSaved={onSaved} />;
});
