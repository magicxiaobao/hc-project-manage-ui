/**
 * Phase 1 任务新建垂直切片（p1-task-create）测试：
 * - buildTaskCreatePayload 纯函数：字段组装、空值省略、日期 'yyyy-MM-dd' 直接透传
 *   （忠实于老前端 TaskCreate.vue 的 toDateOnly 注释：DATE 列契约，不做时区换算）
 * - validateTaskCreateInput：必填项与数字/id 字段校验
 * - API 契约：createTask 走 POST /task/v1/createTask，返回新建任务 id（number）
 * - useCreateTask：mutation 成功后任务域缓存被失效（列表下次读取即出现新任务）
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/task-create.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import { useCreateTask } from '../hooks/useTasks';
import { api } from '../../api/client';
import { taskApi } from '../../api/task';
import {
  buildTaskCreatePayload,
  emptyTaskCreateFormInput,
  parseOptionalNonNegativeInt,
  parseOptionalNonNegativeNumber,
  parseOptionalPositiveInt,
  validateTaskCreateInput,
} from '../../task-create';
import type { TaskCreateFormInput } from '../../task-create';
import type { TaskCreatePayload } from '../../api/task-types';

function validInput(overrides: Partial<TaskCreateFormInput> = {}): TaskCreateFormInput {
  return {
    ...emptyTaskCreateFormInput(),
    title: '联调支付回调',
    taskType: '开发',
    priority: 'HIGH',
    ...overrides,
  };
}

describe('解析可选数字字段', () => {
  it('parseOptionalPositiveInt：空 → null；纯数字 → 数值；0/非数字 → null', () => {
    expect(parseOptionalPositiveInt('')).toBeNull();
    expect(parseOptionalPositiveInt('  ')).toBeNull();
    expect(parseOptionalPositiveInt('12')).toBe(12);
    expect(parseOptionalPositiveInt('007')).toBe(7);
    expect(parseOptionalPositiveInt('0')).toBeNull();
    expect(parseOptionalPositiveInt('abc')).toBeNull();
    expect(parseOptionalPositiveInt('1.5')).toBeNull();
  });

  it('parseOptionalNonNegativeInt：故事点允许 0', () => {
    expect(parseOptionalNonNegativeInt('')).toBeNull();
    expect(parseOptionalNonNegativeInt('0')).toBe(0);
    expect(parseOptionalNonNegativeInt('5')).toBe(5);
    expect(parseOptionalNonNegativeInt('-1')).toBeNull();
  });

  it('parseOptionalNonNegativeNumber：预估工时允许小数', () => {
    expect(parseOptionalNonNegativeNumber('')).toBeNull();
    expect(parseOptionalNonNegativeNumber('2.5')).toBe(2.5);
    expect(parseOptionalNonNegativeNumber('0')).toBe(0);
    expect(parseOptionalNonNegativeNumber('-3')).toBeNull();
    expect(parseOptionalNonNegativeNumber('xx')).toBeNull();
  });
});

describe('validateTaskCreateInput 表单校验', () => {
  it('标题/类型/优先级缺失时给出对应错误', () => {
    expect(validateTaskCreateInput(validInput({ title: '  ' }))).toBe('请填写任务标题');
    expect(validateTaskCreateInput(validInput({ taskType: '' }))).toBe('请填写任务类型');
    expect(validateTaskCreateInput(validInput({ priority: '' }))).toBe('请选择优先级');
    expect(validateTaskCreateInput(validInput({ priority: 'URGENT' }))).toBe('请选择优先级');
  });

  it('id 类字段非法时阻断提交（校验规则与载荷解析一致）', () => {
    expect(validateTaskCreateInput(validInput({ assigneeIdText: 'a1' }))).toBe(
      '执行人用户 ID必须为正整数',
    );
    expect(validateTaskCreateInput(validInput({ parentIdText: 'x' }))).toBe('父任务 ID必须为正整数');
    // Codex review 4175265685："0" / 超过安全整数范围的输入此前会通过校验，
    // 却在组装载荷时被静默丢弃。现在校验直接阻断。
    expect(validateTaskCreateInput(validInput({ assigneeIdText: '0' }))).toBe(
      '执行人用户 ID必须为正整数',
    );
    expect(
      validateTaskCreateInput(validInput({ reporterIdText: `${Number.MAX_SAFE_INTEGER + 1}` })),
    ).toBe('报告人用户 ID必须为正整数');
    expect(validateTaskCreateInput(validInput({ storyPointsText: '-1' }))).toBe(
      '故事点必须为非负整数',
    );
    expect(validateTaskCreateInput(validInput({ estimatedHoursText: '很多' }))).toBe(
      '预估工时必须为非负数字',
    );
  });

  it('开始日期晚于结束日期时阻断', () => {
    expect(
      validateTaskCreateInput(validInput({ startIso: '2026-10-10', endIso: '2026-10-01' })),
    ).toBe('开始日期不能晚于结束日期');
  });

  it('完整合法输入 → null', () => {
    expect(
      validateTaskCreateInput(
        validInput({
          assigneeIdText: '4',
          startIso: '2026-10-01',
          endIso: '2026-10-10',
          estimatedHoursText: '2.5',
        }),
      ),
    ).toBeNull();
  });
});

describe('buildTaskCreatePayload 载荷组装', () => {
  it('全字段：日期以 yyyy-MM-dd 直接透传（不做时区换算），字段裁剪空格', () => {
    const payload = buildTaskCreatePayload(
      validInput({
        description: '  背景说明  ',
        storyPointsText: '3',
        parentIdText: '9',
        assigneeIdText: '4',
        reporterIdText: '5',
        startIso: '2026-10-01',
        endIso: '2026-10-10',
        estimatedHoursText: '2.5',
        tags: ' 联调,支付 ',
        implementsRequirementIds: [12, 34],
      }),
      1001,
    );
    expect(payload).toEqual({
      title: '联调支付回调',
      taskType: '开发',
      priority: 'HIGH',
      projectId: 1001,
      description: '背景说明',
      storyPoints: 3,
      parentId: 9,
      assigneeId: 4,
      reporterId: 5,
      estimatedStartDate: '2026-10-01',
      estimatedEndDate: '2026-10-10',
      estimatedHours: 2.5,
      tags: '联调,支付',
      implementsRequirementIds: [12, 34],
    });
  });

  it('可选字段留空时不提交（undefined），后端按未提交处理', () => {
    const payload = buildTaskCreatePayload(validInput(), 1001);
    expect(payload).toEqual({
      title: '联调支付回调',
      taskType: '开发',
      priority: 'HIGH',
      projectId: 1001,
    });
    expect('description' in payload).toBe(false);
    expect('implementsRequirementIds' in payload).toBe(false);
  });

  it('关联需求去重并上限 200 条', () => {
    const payload = buildTaskCreatePayload(
      validInput({ implementsRequirementIds: [1, 2, 2, 3, ...Array.from({ length: 300 }, (_, i) => i + 100)] }),
      1001,
    );
    expect(payload.implementsRequirementIds).toHaveLength(200);
    expect(new Set(payload.implementsRequirementIds).size).toBe(200);
  });
});

describe('任务创建 API 契约', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createTask 走 POST /task/v1/createTask，返回新建任务 id（number）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(42);
    const payload: TaskCreatePayload = {
      title: '联调支付回调',
      taskType: '开发',
      priority: 'HIGH',
      projectId: 1001,
      implementsRequirementIds: [12],
    };
    const id = await taskApi.createTask(payload);
    expect(id).toBe(42);
    expect(postSpy).toHaveBeenCalledWith('/task/v1/createTask', payload);
    expect(postSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useCreateTask 数据链路（mock api.post）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('提交载荷并返回新建 id，成功后任务域缓存被失效', async () => {
    const payload: TaskCreatePayload = {
      title: '联调支付回调',
      taskType: '开发',
      priority: 'HIGH',
      projectId: 1001,
    };
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(42);
    const client = createQueryClient();
    // 预置列表缓存，验证失效确实命中任务域
    const listKey = queryKeys.task.list({ page: 1, pageSize: 20, bean: { projectId: 1001 } });
    client.setQueryData(listKey, { list: [], total: 0, pageNumber: 1, pageSize: 20 });
    let mutateAsync: ((data: TaskCreatePayload) => Promise<number>) | null = null;
    function SmokeCreate() {
      const mutation = useCreateTask();
      mutateAsync = mutation.mutateAsync;
      return null;
    }
    renderToString(
      <QueryClientProvider client={client}>
        <SmokeCreate />
      </QueryClientProvider>,
    );
    expect(mutateAsync).not.toBeNull();
    const id = await mutateAsync!(payload);
    expect(id).toBe(42);
    expect(postSpy).toHaveBeenCalledWith('/task/v1/createTask', payload);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
