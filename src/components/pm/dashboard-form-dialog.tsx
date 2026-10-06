import { forwardRef } from 'react';
import { RequiredMark } from '@/components/biz/form-guard';
import { buildDashboardCreatePayload, buildDashboardUpdatePayload, dashboardInitial, validateDashboardForm, validId, type DashboardFormInput } from '@/lib/dashboard-form';
import { useCreateDashboard, useDashboardDetail, useUpdateDashboard, toUserMessage } from '@/lib/query';
import { DashboardFormFields, type DashboardField, type Draft, type LeaveHandle } from './dashboard-form-fields';

export const DashboardForm = forwardRef<LeaveHandle, { open: boolean; projectId: number | null; id?: number; onClose: () => void; onSaved: () => void }>(function DashboardForm({ open, projectId, id, onClose, onSaved }, ref) {
  const detail = useDashboardDetail(id, open && id !== undefined);
  const create = useCreateDashboard(); const update = useUpdateDashboard();
  const matching = detail.data && detail.data.id === id && validId(detail.data.projectId) && detail.data.projectId === projectId;
  const initial = id === undefined ? dashboardInitial() : matching && !detail.isFetching ? dashboardInitial(detail.data) : null;
  const fields: DashboardField[] = [
    { name: 'dashboardName', label: '仪表盘名称', required: true }, { name: 'description', label: '描述', kind: 'textarea' },
    { name: 'isPublic', label: '公开标记', kind: 'boolean', hint: '公开标记不代替项目授权。' },
    { name: 'sortOrder', label: '排序值', kind: 'integer' }, { name: 'autoRefresh', label: '自动刷新设置', kind: 'boolean', hint: '保存设置，本页面不启动定时刷新。' },
    { name: 'refreshInterval', label: '刷新间隔（秒）', kind: 'integer' }, { name: 'theme', label: '主题', hint: '建议 light / dark，可保留其他主题值。' },
  ];
  // 条件星号随草稿更新在共享字段渲染器中计算。
  return <DashboardFormFields ref={ref} open={open} title={id === undefined ? '新建仪表盘' : '编辑仪表盘'} initial={initial as unknown as Draft | null} fields={fields}
    loading={id !== undefined && detail.isFetching} loadError={detail.isError ? toUserMessage(detail.error) : detail.isSuccess && !matching ? '详情所属项目或 ID 异常，不能编辑' : undefined} retry={() => void detail.refetch()}
    context={<div className="grid gap-2 text-sm"><div>所属项目{ id === undefined ? <RequiredMark /> : null}：{id === undefined ? projectId ?? '未选择' : detail.data?.projectId ?? '未设置'}</div>
      {/* C1 源码证据：DashboardCreator / DashboardUpdater 强制/忽略这些字段。 */}
      <label>仪表盘类型<input disabled value={id === undefined ? '项目仪表板' : detail.data?.dashboardType ?? '未设置'} className="ml-2 rounded border border-border px-2" /></label>
      <label>默认标记<input disabled value={id === undefined ? '否' : detail.data?.isDefault === null || detail.data?.isDefault === undefined ? '未设置' : detail.data.isDefault ? '是' : '否'} className="ml-2 rounded border border-border px-2" /></label>
      <span>状态：{id === undefined ? '由服务端初始化' : detail.data?.status ?? '未设置'}</span>
      <p className="text-default-500">类型、默认标记由服务端控制；编辑不能移动所属项目。</p></div>}
    validate={draft => validateDashboardForm(draft as unknown as DashboardFormInput, projectId, id)}
    save={draft => id === undefined ? create.mutateAsync(buildDashboardCreatePayload(draft as unknown as DashboardFormInput, projectId!)) : update.mutateAsync(buildDashboardUpdatePayload(draft as unknown as DashboardFormInput, id))}
    onClose={onClose} onSaved={onSaved} />;
});
