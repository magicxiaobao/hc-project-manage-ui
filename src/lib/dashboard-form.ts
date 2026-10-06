import type { DashboardCreatePayload, DashboardResponse, DashboardUpdatePayload } from './api/dashboard-types';

export type FormError = { field: string; message: string };
export const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
export const formDirty = <T extends object>(value: T, initial: T) => JSON.stringify(value) !== JSON.stringify(initial);
export function integerError(value: string | null, min = -2147483648, required = false): string | undefined {
  if (value === null || value.trim() === '') return required ? '请填写整数' : undefined;
  if (!/^-?\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > 2147483647) return `请输入 ${min}–2147483647 范围内的整数`;
}
export function textError(value: string | null, max: number, required = false): string | undefined {
  if (required && !value?.trim()) return '不能为空或仅含空格';
  if ((value?.trim().length ?? 0) > max) return `最多 ${max} 个字符`;
}
export interface DashboardFormInput {
  dashboardName: string;
  description: string | null;
  isPublic: boolean | null;
  sortOrder: string | null;
  refreshInterval: string | null;
  autoRefresh: boolean | null;
  theme: string | null;
}
export function dashboardInitial(detail?: DashboardResponse | null): DashboardFormInput {
  if (!detail) return { dashboardName: '', description: '', isPublic: true, sortOrder: '0', refreshInterval: '300', autoRefresh: false, theme: 'light' };
  return { dashboardName: detail.dashboardName ?? '', description: detail.description, isPublic: detail.isPublic, sortOrder: detail.sortOrder?.toString() ?? null, refreshInterval: detail.refreshInterval?.toString() ?? null, autoRefresh: detail.autoRefresh, theme: detail.theme };
}
export function validateDashboardForm(input: DashboardFormInput, projectId: number | null, id?: number): FormError[] {
  const errors: FormError[] = [];
  const add = (field: string, message?: string) => { if (message) errors.push({ field, message }); };
  add('dashboardName', textError(input.dashboardName, 200, true));
  add(id === undefined ? 'projectId' : 'id', validId(id ?? projectId) ? undefined : '详情或所属项目 ID 无效');
  add('sortOrder', integerError(input.sortOrder));
  add('refreshInterval', integerError(input.refreshInterval, input.autoRefresh === true ? 1 : 0, input.autoRefresh === true));
  add('theme', textError(input.theme, 20));
  for (const field of ['isPublic', 'autoRefresh'] as const) add(field, input[field] !== null && typeof input[field] !== 'boolean' ? '必须为布尔值' : undefined);
  return errors;
}
function writableDashboard(input: DashboardFormInput): DashboardCreatePayload {
  return {
    dashboardName: input.dashboardName.trim(),
    description: input.description ?? undefined,
    isPublic: input.isPublic ?? undefined,
    sortOrder: input.sortOrder?.trim() ? Number(input.sortOrder) : undefined,
    refreshInterval: input.refreshInterval?.trim() ? Number(input.refreshInterval) : undefined,
    autoRefresh: input.autoRefresh ?? undefined,
    theme: input.theme === null ? undefined : input.theme.trim(),
  };
}
// C1: DashboardCreator 强制项目类型/default；DashboardUpdater 忽略归属/类型/default。
// 可选 null 不补默认，Updater 的非 null 更新语义下显式清空文本发送空串。
export const buildDashboardCreatePayload = (input: DashboardFormInput, projectId: number): DashboardCreatePayload => ({ ...writableDashboard(input), projectId });
export const buildDashboardUpdatePayload = (input: DashboardFormInput, id: number): DashboardUpdatePayload => ({ ...writableDashboard(input), id });
