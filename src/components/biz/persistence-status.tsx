export function PersistenceStatus({ ready, error, onRetry, draft = false, saved = false, automatic = false }: {
  ready: boolean;
  error: string | null;
  onRetry: () => void;
  draft?: boolean;
  saved?: boolean;
  automatic?: boolean;
}) {
  return (
    <div aria-label="本机保存状态" role={error ? "alert" : "status"} className="type-caption min-w-0 break-words">
      {error ? <p className="text-danger">{error}</p> : null}
      {draft ? <p>有未提交的修改，尚未保存到本机。</p> : !error ? <p>{!ready ? "等待读取本机数据。" : saved ? "已保存到本机。" : automatic ? "此处修改自动保存到这台浏览器。" : "点击保存后存入这台浏览器。"}</p> : null}
      {error ? <button type="button" className="type-emphasis mt-2 min-h-10 rounded-sm border border-danger px-3 py-1 text-danger" onClick={onRetry}>{ready ? "重试保存" : "重试读取"}</button> : null}
    </div>
  );
}
