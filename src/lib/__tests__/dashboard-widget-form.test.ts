import { describe, expect, it } from 'vitest';
import type { DashboardWidgetResponse } from '../api/dashboard-types';
import { buildWidgetCreatePayload, buildWidgetUpdatePayload, validateWidgetForm, widgetConfigError, widgetInitial } from '../dashboard-widget-form';

describe('WidgetForm', () => {
  it('收集名称、尺寸、位置、JSON、父 ID 以及长度错误', () => {
    const errors = validateWidgetForm({ ...widgetInitial(), widgetName: ' ', widgetTitle: 'a'.repeat(201), widgetType: 'a'.repeat(51), dataSource: 'a'.repeat(51), widgetConfig: '{', positionX: '-1', positionY: '1.5', width: '0', height: null, sortOrder: 'Infinity' }, 0, -1);
    expect(errors.map(item => item.field)).toEqual(['widgetName', 'widgetTitle', 'widgetType', 'dataSource', 'dashboardId', 'id', 'positionX', 'positionY', 'width', 'height', 'sortOrder', 'widgetConfig']);
  });
  it('JSON 拒绝数组/null/标量/畸形，允许合法对象及空文本', () => {
    for (const value of ['[1]', 'null', '1', 'true', '"text"', '{']) expect(widgetConfigError(value)).toBeTruthy();
    for (const value of ['{}', '{"nested":{"flag":false}}', '', null]) expect(widgetConfigError(value)).toBeUndefined();
  });
  it('名称 100/101 边界、正尺寸，不虚构网格边界', () => {
    expect(validateWidgetForm({ ...widgetInitial(), widgetName: 'a'.repeat(100), width: '2147483647', height: '100' }, 1)).toEqual([]);
    expect(validateWidgetForm({ ...widgetInitial(), widgetName: 'a'.repeat(101) }, 1)).toHaveLength(1);
  });
  it('payload 配置是字符串，false/0 保留，省略未编辑的高级字段', () => {
    const input = { ...widgetInitial(), widgetName: ' 名称 ', isVisible: false, widgetType: '未知类型', widgetConfig: ' {"a":0} ' };
    const payload = buildWidgetCreatePayload(input, 9);
    expect(payload).toMatchObject({ dashboardId: 9, widgetName: '名称', isVisible: false, positionX: 0, widgetType: '未知类型', widgetConfig: ' {"a":0} ' });
    for (const field of ['isResizable', 'isDraggable', 'refreshInterval', 'autoRefresh', 'styleConfig', 'filterConfig', 'lastUpdatedAt']) expect(payload).not.toHaveProperty(field);
    expect(buildWidgetUpdatePayload(input, 4)).not.toHaveProperty('dashboardId');
  });
  it('详情 null 数字保留且必填尺寸要求补填', () => {
    const input = widgetInitial({ widgetName: '名称' } as DashboardWidgetResponse);
    expect(input.width).toBeNull();
    expect(validateWidgetForm(input, 1).map(item => item.field)).toContain('width');
    expect(JSON.parse(JSON.stringify(buildWidgetUpdatePayload(input, 4)))).toEqual({ id: 4, widgetName: '名称' });
  });
});
