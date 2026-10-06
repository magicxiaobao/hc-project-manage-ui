import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { PageHeading } from '@/components/biz/page-heading';
import { useDashboardList, useInvalidDashboard, useProjectList, useValidDashboard } from '@/lib/query';
import { validId } from '@/lib/dashboard-form';
import { DashboardForm } from './dashboard-form-dialog';
import { DashboardConfigDialog } from './dashboard-config-dialog';
import { dashboardInputClass, type LeaveHandle } from './dashboard-form-fields';
import { DashboardActionDialog, DashboardFilterInput, DashboardPagination, DashboardQueryError } from './dashboard-list-controls';

export function DashboardListPage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState(''); const [projectPage, setProjectPage] = useState(1);
  const projects = useProjectList({ page: projectPage, pageSize: 20 });
  const [draft, setDraft] = useState({ dashboardName: '', dashboardType: '' });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(12);
  const list = useDashboardList({ projectId, page, pageSize, ...filters });
  const [form, setForm] = useState<{ id?: number } | null>(null); const formRef = useRef<LeaveHandle>(null);
  const [configId, setConfigId] = useState<number | null>(null); const configRef = useRef<LeaveHandle>(null);
  const [action, setAction] = useState<{ id: number; name: string; invalid: boolean } | null>(null);
  const valid = useValidDashboard(); const invalid = useInvalidDashboard();
  const [notice, setNotice] = useState('');
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));
  useEffect(() => { if (list.data && page > pages) setPage(pages); }, [list.data, page, pages]);
  const projectPages = Math.max(1, Math.ceil((projects.data?.total ?? 0) / 20));
  useEffect(() => { if (projects.data && projectPage > projectPages) setProjectPage(projectPages); }, [projects.data, projectPage, projectPages]);
  const changeProject = (id: number | null, name: string) => {
    if (valid.isPending || invalid.isPending) return;
    const change = () => { setProjectId(id); setProjectName(name); setPage(1); setForm(null); setConfigId(null); setAction(null); setNotice(''); };
    const closeConfig = () => { if (configId !== null) configRef.current?.requestLeave(change); else change(); };
    if (form) formRef.current?.requestLeave(closeConfig); else closeConfig();
  };
  const locked = form !== null || configId !== null || action !== null;
  const projectOptions = projects.data?.list ?? [];
  return <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
    <PageHeading title="仪表盘" hint="按项目查看和管理仪表盘及小部件。操作权限由服务端核验。" />
    <div className="rounded border border-border p-4">
      <label className="flex flex-col gap-1 text-sm">项目范围<select aria-label="项目范围" className={dashboardInputClass} value={projectId ?? ''} disabled={valid.isPending || invalid.isPending} onChange={event => { const id = Number(event.target.value); const project = projectOptions.find(item => item.id === id); changeProject(validId(id) ? id : null, project?.projectName ?? ''); }}>
        <option value="">请选择项目</option>
        {projectId && !projectOptions.some(item => item.id === projectId) ? <option value={projectId}>{projectName}（已选择）</option> : null}
        {projectOptions.filter(project => validId(project.id)).map(project => <option key={project.id} value={project.id}>{project.projectName} · {project.projectKey}</option>)}
      </select></label>
      {projects.isFetching ? <p>正在加载项目…</p> : null}
      {projects.isError ? <DashboardQueryError error={projects.error} retry={() => void projects.refetch()} hasData={!!projects.data} /> : null}
      {projects.isSuccess && projects.data.list.length === 0 ? <p>暂无可选项目</p> : null}
      {projects.data ? <div className="mt-2 flex items-center gap-2 text-sm"><span>项目第 {projectPage}/{projectPages} 页 · 共 {projects.data.total} 个</span><Button size="sm" variant="ghost" isDisabled={projects.isFetching || projectPage <= 1} onPress={() => setProjectPage(projectPage - 1)}>上一页项目</Button><Button size="sm" variant="ghost" isDisabled={projects.isFetching || projectPage >= projectPages} onPress={() => setProjectPage(projectPage + 1)}>下一页项目</Button></div> : null}
    </div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); if (!locked) { setFilters({ dashboardName: draft.dashboardName.trim(), dashboardType: draft.dashboardType.trim() }); setPage(1); } }}>
      <DashboardFilterInput label="仪表盘名称" value={draft.dashboardName} disabled={locked} onChange={dashboardName => setDraft(current => ({ ...current, dashboardName }))} />
      <DashboardFilterInput label="仪表盘类型" value={draft.dashboardType} disabled={locked} onChange={dashboardType => setDraft(current => ({ ...current, dashboardType }))} />
      <Button type="submit" variant="secondary" isDisabled={!projectId || locked}>搜索</Button>
      <Button variant="ghost" isDisabled={locked} onPress={() => { const empty = { dashboardName: '', dashboardType: '' }; setDraft(empty); setFilters(empty); setPage(1); }}>重置</Button>
      <Button variant="primary" isDisabled={!projectId || locked} onPress={() => setForm({})}>新建仪表盘</Button>
    </form>
    {/* B1 证据：DashboardServiceImpl.findByPage 只添加 projectId 等值条件，未消费名称/类型。 */}
    <p className="text-sm text-default-500">名称和类型会提交给服务端；当前后端尚未应用这两个筛选条件，筛选效果待联调确认。</p>
    {notice ? <p role="status">{notice}</p> : null}
    {!projectId ? <p>请选择项目查看仪表盘</p> : <>
      {list.isFetching ? <p>{list.data ? '正在刷新仪表盘…' : '正在加载仪表盘…'}</p> : null}
      {list.isError ? <DashboardQueryError error={list.error} refreshing={list.isFetching} hasData={!!list.data} retry={() => void list.refetch()} /> : null}
      {list.data?.list.length === 0 ? <p>{filters.dashboardName || filters.dashboardType ? '没有符合条件的仪表盘' : '暂无仪表盘'}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">{list.data?.list.map(dashboard => <article key={dashboard.id} className="flex flex-col gap-2 rounded border border-border bg-surface p-4">
        <h2 className="font-semibold">{dashboard.dashboardName ?? '未命名'}</h2><p className="break-words text-sm">{dashboard.description ?? '未设置描述'}</p>
        <p className="text-sm text-default-500">#{dashboard.id} · {dashboard.dashboardType ?? '类型未设置'} · {dashboard.status ?? '状态未设置'} · 项目 {dashboard.projectId ?? '未设置'}</p>
        <p className="text-sm text-default-500">默认：{dashboard.isDefault === null ? '未设置' : dashboard.isDefault ? '是' : '否'} · 公开：{dashboard.isPublic === null ? '未设置' : dashboard.isPublic ? '是' : '否'}</p>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setConfigId(dashboard.id)}>查看配置</Button>
          <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setForm({ id: dashboard.id })}>编辑</Button>
          <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setAction({ id: dashboard.id, name: dashboard.dashboardName ?? String(dashboard.id), invalid: false })}>启用</Button>
          <Button size="sm" variant="ghost" isDisabled={locked} onPress={() => setAction({ id: dashboard.id, name: dashboard.dashboardName ?? String(dashboard.id), invalid: true })}>删除入口（归档）</Button>
        </div>
      </article>)}</div>
      {list.data ? <DashboardPagination page={page} pageSize={pageSize} total={list.data.total} disabled={locked || list.isFetching} onPage={setPage} onSize={size => { setPageSize(size); setPage(1); }} /> : null}
    </>}
    <DashboardForm ref={formRef} open={form !== null} projectId={projectId} id={form?.id} onClose={() => setForm(null)} onSaved={() => setNotice('已保存，正在重新读取仪表盘。')} />
    <DashboardConfigDialog ref={configRef} open={configId !== null} dashboardId={configId} projectId={projectId} onClose={() => setConfigId(null)} />
    <DashboardActionDialog target={action} onClose={() => setAction(null)} run={() => action!.invalid ? invalid.mutateAsync(action!.id) : valid.mutateAsync(action!.id)} onSuccess={() => setNotice(action?.invalid ? '仪表盘已归档，正在重取。' : '仪表盘已启用，正在重取。')} />
  </div>;
}
