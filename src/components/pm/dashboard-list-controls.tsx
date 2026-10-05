import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { AppModal } from '@/components/biz/app-modal';
import { toUserMessage } from '@/lib/query';
import { dashboardInputClass } from './dashboard-form-fields';

export function DashboardPagination({ page, pageSize, total, disabled, onPage, onSize }: { page: number; pageSize: number; total: number; disabled?: boolean; onPage: (page: number) => void; onSize: (size: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="flex flex-wrap items-center gap-3 text-sm">
    <span>共 {total} 条 · 第 {page} / {pages} 页</span>
    <label>每页条数<select aria-label="每页条数" value={pageSize} disabled={disabled} className="ml-2 rounded border border-border" onChange={event => onSize(Number(event.target.value))}>{[12, 24, 48].map(size => <option key={size}>{size}</option>)}</select></label>
    <Button variant="ghost" size="sm" isDisabled={disabled || page <= 1} onPress={() => onPage(page - 1)}>上一页</Button>
    <Button variant="ghost" size="sm" isDisabled={disabled || page >= pages} onPress={() => onPage(page + 1)}>下一页</Button>
  </div>;
}
export function DashboardQueryError({ error, retry, refreshing = false, hasData = false }: { error: unknown; retry: () => void; refreshing?: boolean; hasData?: boolean }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 text-danger"><span>{hasData ? '刷新失败，内容未更新（若刚完成写入，已保存，请重试读取）：' : '读取失败：'}{toUserMessage(error)}</span><Button variant="ghost" size="sm" isDisabled={refreshing} onPress={retry}>重试</Button></div>;
}
export function DashboardActionDialog({ target, onClose, run, onSuccess }: { target: { id: number; name: string; invalid: boolean; widget?: boolean } | null; onClose: () => void; run: () => Promise<unknown>; onSuccess: () => void }) {
  const [pending, setPending] = useState(false); const busy = useRef(false); const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [target]);
  const submit = async () => {
    if (busy.current || !target) return;
    busy.current = true; setPending(true); setError('');
    try { await run(); onSuccess(); onClose(); } catch (cause) { setError(toUserMessage(cause)); }
    finally { busy.current = false; setPending(false); }
  };
  return <AppModal open={target !== null} title={target?.invalid ? '确认删除入口操作' : '确认启用'} size="sm" onClose={() => { if (!busy.current) onClose(); }} isDismissDisabled={pending}>
    <p>确认对「{target?.name}」执行{target?.invalid ? '删除入口' : '启用'}操作？</p>
    {/* B2: Dashboard.invalid 写 status=归档；DashboardWidget.invalid 写 isVisible=false，未删除记录。 */}
    {target?.invalid ? <p className="mt-2 text-sm text-default-500">当前服务端仅{target.widget ? '隐藏小部件' : '归档仪表盘'}，记录可能继续出现在列表中，可再次启用。逻辑删除语义待联调确认。</p> : null}
    {error ? <p role="alert" className="text-danger">{error}</p> : null}
    <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" isDisabled={pending} onPress={onClose}>取消</Button><Button variant={target?.invalid ? 'danger' : 'primary'} isDisabled={pending} onPress={() => void submit()}>{pending ? '处理中…' : '确认'}</Button></div>
  </AppModal>;
}
export function DashboardReadonly({ label, value }: { label: string; value: unknown }) {
  return <details className="rounded border border-border p-3"><summary>{label}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">{value == null ? '未设置' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></details>;
}
export function DashboardFilterInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="flex min-w-40 flex-col gap-1 text-sm">{label}<input className={dashboardInputClass} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} /></label>;
}
