import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { useBlocker } from '@tanstack/react-router';
import { AppModal } from '@/components/biz/app-modal';
import { FieldError, RequiredMark, useUnsavedChangesGuard } from '@/components/biz/form-guard';
import { formDirty, type FormError } from '@/lib/dashboard-form';
import { toUserMessage } from '@/lib/query';

export interface LeaveHandle { requestLeave: (action: () => void) => void }
export interface DashboardField { name: string; label: string; required?: boolean; kind?: 'text' | 'textarea' | 'integer' | 'boolean'; hint?: string }
export type Draft = Record<string, string | boolean | null>;
export const dashboardInputClass = 'w-full rounded border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60';

/** 两个表单共享快照/关闭规则，组件始终挂载，详情 refetch 不替换已有草稿。 */
export const DashboardFormFields = forwardRef<LeaveHandle, {
  open: boolean; title: string; initial: Draft | null; fields: DashboardField[];
  context: ReactNode; loadError?: string; loading?: boolean; retry: () => void;
  validate: (draft: Draft) => FormError[]; save: (draft: Draft) => Promise<unknown>;
  onClose: () => void; onSaved: () => void;
}>(function DashboardFormFields({ open, title, initial, fields, context, loadError, loading, retry, validate, save, onClose, onSaved }, ref) {
  const [draft, setDraft] = useState<Draft>({});
  const [snapshot, setSnapshot] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const initialized = useRef(false);
  const body = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open) { initialized.current = false; setSnapshot(null); setFieldErrors({}); setSubmitError(''); return; }
    if (!initialized.current && initial) {
      initialized.current = true;
      setDraft({ ...initial }); setSnapshot({ ...initial });
      setFieldErrors(Object.fromEntries(validate(initial).filter(error => error.field === 'widgetConfig').map(error => [error.field, error.message])));
      setSubmitError('');
    }
  }, [open, initial]);
  const dirty = open && snapshot !== null && formDirty(draft, snapshot);
  // 保存期间直接拒绝导航；共享 dirty blocker 在保存之外处理放弃确认。
  useBlocker({ shouldBlockFn: () => busy.current, enableBeforeUnload: () => busy.current });
  const { guard, markClean, dialog, blocker } = useUnsavedChangesGuard(dirty);
  const leave = (action: () => void) => { if (!busy.current) guard(action); };
  useImperativeHandle(ref, () => ({ requestLeave: leave }));
  const edit = (name: string, value: string | boolean | null) => {
    setDraft(current => ({ ...current, [name]: value }));
    setFieldErrors(current => {
      const next = { ...current }; delete next[name];
      if (name === 'autoRefresh') delete next.refreshInterval;
      if (name === 'refreshInterval') delete next.autoRefresh;
      return next;
    });
  };
  const submit = async () => {
    if (busy.current || !snapshot) return;
    const errors = validate(draft);
    setFieldErrors(Object.fromEntries(errors.map(error => [error.field, error.message])));
    if (errors.length) { body.current?.querySelector<HTMLElement>(`[name="${errors[0].field}"]`)?.focus(); return; }
    busy.current = true; setPending(true); setSubmitError('');
    try { await save(draft); markClean(); onSaved(); onClose(); }
    catch (error) { setSubmitError(toUserMessage(error)); }
    finally { busy.current = false; setPending(false); }
  };
  return <>
    {blocker}
    {dialog}
    <AppModal open={open} title={title} onClose={() => leave(onClose)} size="lg" isDismissDisabled={pending}>
      <form ref={body} onSubmit={event => { event.preventDefault(); void submit(); }} className="flex flex-col gap-4" aria-busy={pending}>
        {context}
        {loading && !snapshot ? <p>正在加载详情…</p> : null}
        {loadError ? <div role="alert" className="text-danger">{snapshot ? '详情刷新失败，当前草稿未更新：' : '详情读取失败：'}{loadError}<Button variant="ghost" onPress={retry}>重试</Button></div> : null}
        {snapshot ? <>
          <p className="type-caption text-default-500">未设置的可选项保持原值；清空数字不提供服务端清空能力。保存后重新读取服务端结果。</p>
          <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
            {fields.map(field => <div key={field.name} className={field.kind === 'textarea' ? 'sm:col-span-2' : ''}>
              <label htmlFor={`${title}-${field.name}`} className="mb-1 block text-sm">{field.label}{field.required || (field.name === 'refreshInterval' && draft.autoRefresh === true) ? <RequiredMark /> : null}</label>
              {field.kind === 'boolean' ? <select id={`${title}-${field.name}`} name={field.name} className={dashboardInputClass} value={draft[field.name] === null ? '' : String(draft[field.name])} onChange={event => edit(field.name, event.target.value === 'true')}>
                <option value="" disabled>未设置</option><option value="true">是</option><option value="false">否</option>
              </select> : field.kind === 'textarea' ? <textarea id={`${title}-${field.name}`} name={field.name} className={dashboardInputClass} rows={4} placeholder={draft[field.name] === null ? '未设置' : undefined} value={String(draft[field.name] ?? '')} onChange={event => edit(field.name, event.target.value)} /> :
              <input id={`${title}-${field.name}`} name={field.name} className={dashboardInputClass} inputMode={field.kind === 'integer' ? 'numeric' : undefined} placeholder={draft[field.name] === null ? '未设置' : undefined} value={String(draft[field.name] ?? '')} onChange={event => edit(field.name, event.target.value)} />}
              <FieldError message={fieldErrors[field.name]} />
              {field.hint ? <p className="type-caption text-default-500">{field.hint}</p> : null}
            </div>)}
          </fieldset>
        </> : null}
        {Object.entries(fieldErrors).filter(([field]) => !fields.some(item => item.name === field)).map(([field, message]) => <FieldError key={field} message={message} />)}
        {submitError ? <p role="alert" className="text-danger">{submitError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={() => leave(onClose)} isDisabled={pending}>取消</Button>
          <Button type="submit" variant="primary" isDisabled={pending || !snapshot}>{pending ? '保存中…' : '保存'}</Button>
        </div>
      </form>
    </AppModal>
  </>;
});
