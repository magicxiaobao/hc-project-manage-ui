export interface NotificationCountState {
  count?: number;
  loading?: boolean;
  failed?: boolean;
}
export function notificationAccessibleLabel({ count, loading, failed }: NotificationCountState) {
  if (failed) return "通知，未读数暂不可用";
  if (count === undefined) return loading ? "通知，未读数加载中" : "通知，未读数暂不可用";
  return `通知，${count} 条未读`;
}
/** 纯展示；加载/失败使用问号，不能将未知数量显示为零。 */
export function NotificationBadge(state: NotificationCountState) {
  const { count, loading, failed } = state;
  if (!failed && count === 0) return null;
  return (
    <span
      aria-hidden="true"
      title={notificationAccessibleLabel(state)}
      className="absolute -right-3 -top-2 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 text-white"
    >
      {failed || count === undefined
        ? loading && !failed
          ? "…"
          : "?"
        : count > 99
          ? "99+"
          : count}
    </span>
  );
}
