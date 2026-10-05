import type { DashboardWidgetCreatePayload, DashboardWidgetResponse, DashboardWidgetUpdatePayload } from './api/dashboard-types';
import { integerError, textError, validId, type FormError } from './dashboard-form';

export interface DashboardWidgetFormInput {
  widgetName: string;
  widgetTitle: string | null;
  widgetType: string | null;
  dataSource: string | null;
  widgetConfig: string | null;
  positionX: string | null;
  positionY: string | null;
  width: string | null;
  height: string | null;
  sortOrder: string | null;
  isVisible: boolean | null;
}
export function widgetInitial(detail?: DashboardWidgetResponse | null): DashboardWidgetFormInput {
  if (!detail) return { widgetName: '', widgetTitle: '', widgetType: 'card', dataSource: 'task', widgetConfig: '{}', positionX: '0', positionY: '0', width: '6', height: '4', sortOrder: '0', isVisible: true };
  return { widgetName: detail.widgetName ?? '', widgetTitle: detail.widgetTitle, widgetType: detail.widgetType, dataSource: detail.dataSource, widgetConfig: detail.widgetConfig, positionX: detail.positionX?.toString() ?? null, positionY: detail.positionY?.toString() ?? null, width: detail.width?.toString() ?? null, height: detail.height?.toString() ?? null, sortOrder: detail.sortOrder?.toString() ?? null, isVisible: detail.isVisible };
}
export function widgetConfigError(value: string | null): string | undefined {
  if (!value?.trim()) return;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '配置必须是 JSON 对象';
  } catch { return '配置不是合法 JSON'; }
}
export function validateWidgetForm(input: DashboardWidgetFormInput, dashboardId: number | null, id?: number): FormError[] {
  const errors: FormError[] = [];
  const add = (field: string, message?: string) => { if (message) errors.push({ field, message }); };
  add('widgetName', textError(input.widgetName, 100, true));
  for (const [field, max] of [['widgetTitle', 200], ['widgetType', 50], ['dataSource', 50]] as const) add(field, (input[field]?.length ?? 0) > max ? `最多 ${max} 个字符` : undefined);
  add('dashboardId', validId(dashboardId) ? undefined : '所属仪表盘 ID 无效');
  if (id !== undefined) add('id', validId(id) ? undefined : '小部件详情 ID 无效');
  for (const field of ['positionX', 'positionY'] as const) add(field, integerError(input[field], 0));
  for (const field of ['width', 'height'] as const) add(field, integerError(input[field], 1, true));
  add('sortOrder', integerError(input.sortOrder));
  add('widgetConfig', widgetConfigError(input.widgetConfig));
  add('isVisible', input.isVisible !== null && typeof input.isVisible !== 'boolean' ? '必须为布尔值' : undefined);
  return errors;
}
function writableWidget(input: DashboardWidgetFormInput): DashboardWidgetCreatePayload {
  return {
    widgetName: input.widgetName.trim(), widgetTitle: input.widgetTitle ?? undefined,
    widgetType: input.widgetType ?? undefined, dataSource: input.dataSource ?? undefined,
    widgetConfig: input.widgetConfig ?? undefined, isVisible: input.isVisible ?? undefined,
    ...Object.fromEntries((['positionX', 'positionY', 'width', 'height', 'sortOrder'] as const).map(field => [field, input[field]?.trim() ? Number(input[field]) : undefined])),
  };
}
export const buildWidgetCreatePayload = (input: DashboardWidgetFormInput, dashboardId: number): DashboardWidgetCreatePayload => ({ ...writableWidget(input), dashboardId });
export const buildWidgetUpdatePayload = (input: DashboardWidgetFormInput, id: number): DashboardWidgetUpdatePayload => ({ ...writableWidget(input), id });
