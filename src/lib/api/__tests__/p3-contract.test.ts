import { relationFixture, batchRelationFixture } from '../../__tests__/fixtures/trace-relations';
import { relationPayload } from '../../trace-relations';
import { ApiBusinessError } from '../client';
import { toUserMessage } from '../../query/error';
import type { LinkRelationPayload } from '../trace-types';
import { defectApi } from '../defect';
import { testCaseApi } from '../test-case';

/**
 * 敏捷域契约（P3；来自后端 BoardController/BoardColumnController/SprintController/
 * TaskDependencyController/TaskController 甘特能力/MilestoneController/
 * RequirementTraceController/TraceabilityRelationController）：
 * - 看板：POST /board/v1/createBoard/updateBoard/valid/{id}/invalid/{id}/
 *   findByPage/project/{projectId}/findByPage/setDefault/{id}/
 *   sprint/{sprintId}/create/archive/{id}/activate/{id}/copy/{id}；
 *   GET findById/{id}/project/{projectId}/default/sprint/{sprintId}；
 *   create/copy 的名称走 @RequestParam 查询参数
 * - 看板列：POST /boardColumn/v1/createBoardColumn/updateBoardColumn/delete/{id}/
 *   reorder/findByPage（delete 不是 invalid，老前端调错必 404）；
 *   GET board/{boardId}/columnsWithTasks/findById/{id}；reorder 请求体 { ids }
 * - 冲刺：POST /sprint/v1/createSprint/updateSprint/valid/{id}/invalid/{id}/
 *   findByPage/project/{projectId}/findByPage/start/{id}/complete/{id}/cancel/{id}/
 *   retrospective/{sprintId}；GET findById/{id}/active/project/{projectId}/
 *   burndownChart/{id}/retrospective/{sprintId}；
 *   complete 请求体 { disposition, targetSprintId? }；回顾 POST 请求体 { retrospective }；
 *   burndown/{sprintId}/statistics/{sprintId} 为 TODO 空壳不接线
 * - 任务依赖：POST /taskDependency/v1/createTaskDependency/updateTaskDependency/
 *   valid/{id}/invalid/{id}/findByPage/detectConflicts/batchDelete/getStatistics/
 *   checkCircularDependency；GET findById/{id}/getPredecessors/{taskId}/
 *   getSuccessors/{taskId}；detectConflicts/getStatistics 请求体 { projectId }；
 *   batchDelete 请求体 { ids }；checkCircularDependency 返回 boolean
 * - 甘特：GET /task/v1/gantt/{projectId}/dependencies/{taskId}/
 *   criticalPath/{projectId}/floats/{projectId}；POST /task/v1/batchUpdate
 *   请求体 { tasks: [{id, text?, start_date?, end_date?, progress?}] }（不接受状态字段）
 * - 里程碑（无 /v1）：POST /milestone/create//update//delete/{id}//page；
 *   GET /milestone/{id}/list/{projectId}；update 走字段 + xxxSubmitted 显式提交
 * - 追溯：GET /requirement/v1/trace/{requirementId}/{requirementId}/impact；
 *   POST /requirement/v1/trace/matrix/findByPage；
 *   POST /traceability/v1/relations/link//unlink//batch-query
 *   （unlink 的 reason 必填；export 导出为 P3 明确排除项）
 */
import { matrixFixture } from '../../__tests__/fixtures/trace-matrix';
import { describe, expect, it, vi } from 'vitest';
import { boardApi, boardColumnApi } from '../board';
import { sprintApi } from '../sprint';
import { taskDependencyApi } from '../task-dependency';
import { ganttApi, milestoneApi } from '../gantt';
import { requirementTraceApi, traceabilityRelationApi } from '../trace';

const memStore = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memStore.set(k, v);
  },
  removeItem: (k: string) => {
    memStore.delete(k);
  },
});

function mockFetchSequence(
  responses: Array<{ status?: number; body: unknown }>,
) {
  const mock = vi.fn();
  for (const r of responses) {
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('看板契约（P3）', () => {
  it('看板 CRUD/启用/归档/设默认/归档/激活/复制', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 71 } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: '看板已归档' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: '看板已激活' } },
      { body: { code: 1, msg: 'ok', result: 72 } },
    ]);
    const createPayload = { boardName: 'Sprint 12 看板', projectId: 3, boardType: 'SPRINT' };
    const id = await boardApi.createBoard(createPayload);
    expect(id).toBe(71);
    await boardApi.updateBoard({ id: 71, boardName: 'Sprint 12 看板（改）' });
    await boardApi.archiveBoard(71);
    await boardApi.activateBoard(71);
    await boardApi.setDefault(71);
    const copiedId = await boardApi.copyBoard(71, 'Sprint 13 看板');

    expect(copiedId).toBe(72);
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/board/v1/createBoard');
    expect(calls[0][1].method).toBe('POST');
    expect(JSON.parse(calls[0][1].body as string)).toEqual(createPayload);
    expect(calls[1][0]).toBe('/api/board/v1/updateBoard');
    expect(calls[2][0]).toBe('/api/board/v1/archive/71');
    expect(calls[3][0]).toBe('/api/board/v1/activate/71');
    expect(calls[4][0]).toBe('/api/board/v1/setDefault/71');
    // copy 的 newBoardName 走 @RequestParam 查询参数，请求体为空
    expect(calls[5][0]).toBe(
      '/api/board/v1/copy/71?newBoardName=' + encodeURIComponent('Sprint 13 看板'),
    );
    expect(calls[5][1].method).toBe('POST');
  });

  it('看板查询：详情/项目默认/冲刺看板/冲刺建看板', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 71, boardName: '主看板', projectId: 3 } } },
      { body: { code: 1, msg: 'ok', result: { id: 71, boardName: '主看板', projectId: 3 } } },
      { body: { code: 1, msg: 'ok', result: null } },
      { body: { code: 1, msg: 'ok', result: 73 } },
    ]);
    await boardApi.getById(71);
    await boardApi.getDefaultByProject(3);
    const sprintBoard = await boardApi.getSprintBoard(9);
    expect(sprintBoard).toBeNull();
    const created = await boardApi.createSprintBoard(9, '冲刺看板');

    expect(created).toBe(73);
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/board/v1/findById/71');
    expect(calls[0][1].method).toBe('GET');
    expect(calls[1][0]).toBe('/api/board/v1/project/3/default');
    expect(calls[2][0]).toBe('/api/board/v1/sprint/9');
    // 冲刺建看板：boardName 走 @RequestParam，无请求体
    expect(calls[3][0]).toBe(
      '/api/board/v1/sprint/9/create?boardName=' + encodeURIComponent('冲刺看板'),
    );
    expect(calls[3][1].method).toBe('POST');
  });

  it('看板分页：project/{projectId}/findByPage 请求体仍为标准分页', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { list: [], total: 0, pageNumber: 1, pageSize: 20 } } },
    ]);
    const params = { page: 1, pageSize: 20, bean: { boardName: '看板' } };
    await boardApi.findByProject(3, params);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/board/v1/project/3/findByPage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(params);
  });

  it('看板列：列删除走 POST delete/{id} 而不是 invalid/{id}；重排序请求体 { ids }', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 51 } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: '重排序成功' } },
      { body: { code: 1, msg: 'ok', result: [] } },
    ]);
    const colId = await boardColumnApi.createBoardColumn({
      boardId: 71,
      columnName: '测试中',
      taskStatus: 'TESTING',
      color: '#1890ff',
    });
    expect(colId).toBe(51);
    await boardColumnApi.deleteBoardColumn(51);
    await boardColumnApi.reorder([52, 51, 53]);
    await boardColumnApi.getColumnsWithTasks(71);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/boardColumn/v1/createBoardColumn');
    // 老前端误调 /boardColumn/v1/invalid/{id} 必 404，正确是 delete/{id}
    expect(calls[1][0]).toBe('/api/boardColumn/v1/delete/51');
    expect(calls[1][1].method).toBe('POST');
    expect(calls[2][0]).toBe('/api/boardColumn/v1/reorder');
    expect(JSON.parse(calls[2][1].body as string)).toEqual({ ids: [52, 51, 53] });
    expect(calls[3][0]).toBe('/api/boardColumn/v1/board/71/columnsWithTasks');
    expect(calls[3][1].method).toBe('GET');
  });
});

describe('冲刺契约（P3）', () => {
  it('冲刺 CRUD/开始/取消', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 91 } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: '冲刺已开始' } },
      { body: { code: 1, msg: 'ok', result: '冲刺已取消' } },
    ]);
    const createPayload = {
      sprintName: 'Sprint 12',
      projectId: 3,
      plannedStartDate: '2026-10-01T00:00:00',
      plannedEndDate: '2026-10-14T00:00:00',
      capacity: 40,
    };
    const id = await sprintApi.createSprint(createPayload);
    expect(id).toBe(91);
    await sprintApi.updateSprint({ id: 91, sprintGoal: '交付登录' });
    await sprintApi.startSprint(91);
    await sprintApi.cancelSprint(91);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/sprint/v1/createSprint');
    expect(JSON.parse(calls[0][1].body as string)).toEqual(createPayload);
    expect(calls[1][0]).toBe('/api/sprint/v1/updateSprint');
    expect(calls[2][0]).toBe('/api/sprint/v1/start/91');
    expect(calls[2][1].method).toBe('POST');
    expect(calls[3][0]).toBe('/api/sprint/v1/cancel/91');
  });

  it('完成冲刺请求体 { disposition, targetSprintId? }；TARGET_SPRINT 必带目标冲刺', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: '冲刺已完成' } },
      { body: { code: 1, msg: 'ok', result: '冲刺已完成' } },
    ]);
    await sprintApi.completeSprint(91, { disposition: 'BACKLOG' });
    await sprintApi.completeSprint(92, { disposition: 'TARGET_SPRINT', targetSprintId: 93 });

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/sprint/v1/complete/91');
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ disposition: 'BACKLOG' });
    expect(calls[1][0]).toBe('/api/sprint/v1/complete/92');
    expect(JSON.parse(calls[1][1].body as string)).toEqual({
      disposition: 'TARGET_SPRINT',
      targetSprintId: 93,
    });
  });

  it('燃尽图走 /burndownChart/{id}（真实实现），不接 TODO 空壳的 /burndown/{sprintId}', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { dates: ['10-01'], values: [40], dailyHours: [8] } } },
    ]);
    const data = await sprintApi.getBurndownChart(91);
    expect(data.values).toEqual([40]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/sprint/v1/burndownChart/91');
    expect(init.method).toBe('GET');
  });

  it('冲刺回顾：GET 返回字符串；POST 请求体 { retrospective }', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: '回顾文本' } },
      { body: { code: 1, msg: 'ok', result: 'OK' } },
    ]);
    const text = await sprintApi.getRetrospective(91);
    expect(text).toBe('回顾文本');
    await sprintApi.updateRetrospective(91, '新的回顾');

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/sprint/v1/retrospective/91');
    expect(calls[0][1].method).toBe('GET');
    expect(calls[1][0]).toBe('/api/sprint/v1/retrospective/91');
    expect(calls[1][1].method).toBe('POST');
    // 后端读 body.get("retrospective")
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ retrospective: '新的回顾' });
  });
});

describe('任务依赖契约（P3）', () => {
  it("分页使用 page/pageSize/bean，响应为平铺边；valid/findById 已有契约", async () => {
    const edge = {
      id: 11,
      predecessorId: 201,
      successorId: 202,
      projectId: 3,
      dependencyType: "finish-to-start",
      lag: 3,
      description: "等待验收",
      status: "ACTIVE",
      createdAt: null,
      updatedAt: null,
    };
    const paged = { list: [edge], total: 1, pageNumber: 1, pageSize: 200 };
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: "ok", result: paged } },
      { body: { code: 1, msg: "ok", result: [edge] } },
      { body: { code: 1, msg: "ok", result: [edge] } },
      { body: { code: 1, msg: "ok", result: false } },
      { body: { code: 1, msg: "ok", result: "success" } },
      { body: { code: 1, msg: "ok", result: edge } },
    ]);
    const args = { page: 1, pageSize: 200, bean: { projectId: 3 } };
    expect(await taskDependencyApi.findByPage(args)).toEqual(paged);
    expect(await taskDependencyApi.getPredecessors(202)).toEqual([edge]);
    expect(await taskDependencyApi.getSuccessors(201)).toEqual([edge]);
    const payload = {
      predecessorId: 201,
      successorId: 202,
      projectId: 3,
      dependencyType: "finish-to-start",
      lag: 3,
      description: "等待验收",
    };
    expect(await taskDependencyApi.checkCircularDependency(payload)).toBe(false);
    await taskDependencyApi.validDependency(11);
    expect(await taskDependencyApi.getById(11)).toEqual(edge);
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe("/api/taskDependency/v1/findByPage");
    expect(calls[0][1].method).toBe("POST");
    expect(JSON.parse(calls[0][1].body as string)).toEqual(args);
    expect(calls[1][1].method).toBe("GET");
    expect(calls[1][1].body).toBeUndefined();
    expect(calls[2][1].method).toBe("GET");
    expect(calls[2][1].body).toBeUndefined();
    expect(JSON.parse(calls[3][1].body as string)).toEqual(payload);
    expect(calls[4][0]).toBe("/api/taskDependency/v1/valid/11");
    expect(calls[4][1].method).toBe("POST");
    expect(calls[5][0]).toBe("/api/taskDependency/v1/findById/11");
    expect(calls[5][1].method).toBe("GET");
  });

  it('依赖 CRUD/启用/归档', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 81 } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    const createPayload = { predecessorId: 201, successorId: 202, dependencyType: 'finish-to-start', projectId: 3, lag: 3, description: '等待验收' };
    const newId = await taskDependencyApi.createTaskDependency(createPayload);
    expect(newId).toBe(81);
    await taskDependencyApi.updateTaskDependency({ id: 11, lag: 2 });
    await taskDependencyApi.invalidDependency(11);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/taskDependency/v1/createTaskDependency');
    expect(calls[0][1].method).toBe('POST');
    expect(JSON.parse(calls[0][1].body as string)).toEqual(createPayload);
    expect(calls[1][0]).toBe('/api/taskDependency/v1/updateTaskDependency');
    expect(calls[1][1].method).toBe('POST');
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ id: 11, lag: 2 });
    expect(calls[2][0]).toBe('/api/taskDependency/v1/invalid/11');
    expect(calls[2][1].method).toBe('POST');
  });

  it('冲突检测/统计请求体 { projectId }；批量删除请求体 { ids }', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [] } },
      { body: { code: 1, msg: 'ok', result: {} } },
      { body: { code: 1, msg: 'ok', result: '批量删除成功' } },
    ]);
    await taskDependencyApi.detectConflicts(3);
    await taskDependencyApi.getStatistics(3);
    await taskDependencyApi.batchDelete([11, 12]);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/taskDependency/v1/detectConflicts');
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ projectId: 3 });
    expect(calls[1][0]).toBe('/api/taskDependency/v1/getStatistics');
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ projectId: 3 });
    expect(calls[0][1].method).toBe('POST');
    expect(calls[1][1].method).toBe('POST');
    expect(calls[2][1].method).toBe('POST');
    expect(calls[2][0]).toBe('/api/taskDependency/v1/batchDelete');
    expect(JSON.parse(calls[2][1].body as string)).toEqual({ ids: [11, 12] });
  });

  it('循环依赖检查返回 boolean；前置/后置查询为 GET', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: true } },
      { body: { code: 1, msg: 'ok', result: [] } },
      { body: { code: 1, msg: 'ok', result: [] } },
    ]);
    const hasCircular = await taskDependencyApi.checkCircularDependency({
      predecessorId: 202,
      successorId: 201,
      projectId: 3,
    });
    expect(hasCircular).toBe(true);
    await taskDependencyApi.getPredecessors(201);
    await taskDependencyApi.getSuccessors(201);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/taskDependency/v1/checkCircularDependency');
    expect(calls[0][1].method).toBe('POST');
    expect(calls[1][0]).toBe('/api/taskDependency/v1/getPredecessors/201');
    expect(calls[1][1].method).toBe('GET');
    expect(calls[2][0]).toBe('/api/taskDependency/v1/getSuccessors/201');
  });
});

describe('甘特图/里程碑契约（P3）', () => {
  it('甘特数据/依赖/关键路径/浮动时间', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { tasks: [], links: [] } } },
      { body: { code: 1, msg: 'ok', result: {} } },
      { body: { code: 1, msg: 'ok', result: { criticalTasks: [] } } },
      { body: { code: 1, msg: 'ok', result: { 201: 3 } } },
    ]);
    await ganttApi.getGanttData(3);
    await ganttApi.getTaskDependencies(201);
    await ganttApi.getCriticalPath(3);
    await ganttApi.getTaskFloats(3);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/task/v1/gantt/3');
    expect(calls[0][1].method).toBe('GET');
    expect(calls[1][0]).toBe('/api/task/v1/dependencies/201');
    // 关键路径走后端计算，不做前端本地算
    expect(calls[2][0]).toBe('/api/task/v1/criticalPath/3');
    expect(calls[3][0]).toBe('/api/task/v1/floats/3');
  });

  it('批量更新：请求体 { tasks }，只接受标题/计划起止日/进度，不含状态字段', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 'OK' } },
    ]);
    const payload = {
      tasks: [
        { id: 201, text: '新标题', start_date: '2026-10-05', end_date: '2026-10-08', progress: 50 },
      ],
    };
    await ganttApi.batchUpdateTasks(payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/task/v1/batchUpdate');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual(payload);
    expect(body.tasks[0]).not.toHaveProperty('status');
  });

  it('里程碑 CRUD：无 /v1 前缀；update 字段出现即提交（绝不发送 xxxSubmitted）', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 81 } },
      { body: { code: 1, msg: 'ok', result: null } },
      { body: { code: 1, msg: 'ok', result: null } },
      { body: { code: 1, msg: 'ok', result: [{ id: 81, name: 'M1', projectId: 3 }] } },
    ]);
    const createPayload = { projectId: 3, name: 'M1', status: 'not_started' as const };
    const id = await milestoneApi.createMilestone(createPayload);
    expect(id).toBe(81);
    await milestoneApi.updateMilestone({
      id: 81,
      name: 'M1 改',
    });
    await milestoneApi.deleteMilestone(81);
    const list = await milestoneApi.listByProject(3);
    expect(list[0].name).toBe('M1');

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/milestone/create');
    expect(JSON.parse(calls[0][1].body as string)).toEqual(createPayload);
    expect(calls[1][0]).toBe('/api/milestone/update');
    expect(JSON.parse(calls[1][1].body as string)).toEqual({
      id: 81,
      name: 'M1 改',
    });
    expect(calls[2][0]).toBe('/api/milestone/delete/81');
    expect(calls[3][0]).toBe('/api/milestone/list/3');
    expect(calls[3][1].method).toBe('GET');
  });
});

describe('追溯契约（P3）', () => {
  it('追溯详情/影响范围为 GET；矩阵为 POST 标准分页', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: {} } },
      { body: { code: 1, msg: 'ok', result: {} } },
      { body: { code: 1, msg: 'ok', result: { list: [], total: 0, pageNumber: 1, pageSize: 20 } } },
    ]);
    await requirementTraceApi.getTrace(101);
    await requirementTraceApi.getImpact(101);
    const params = { page: 1, pageSize: 20, bean: { projectId: 3 } };
    await requirementTraceApi.findMatrix(params);

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe('/api/requirement/v1/trace/101');
    expect(calls[0][1].method).toBe('GET');
    expect(calls[1][0]).toBe('/api/requirement/v1/trace/101/impact');
    expect(calls[2][0]).toBe('/api/requirement/v1/trace/matrix/findByPage');
    expect(calls[2][1].method).toBe('POST');
    expect(JSON.parse(calls[2][1].body as string)).toEqual(params);
  });

  it('人工关系 link/unlink/batch-query 完整信封与原始五元组', async () => {
    const relation = relationFixture();
    const inactive = { ...relation, status: 'INACTIVE', inactiveReason: '误关联' };
    const batch = batchRelationFixture();
    const emptyObject = { objectType: 'TASK' as const, objectId: 202 };
    batch.items.push({ object: emptyObject, outgoing: [], incoming: [] });
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: relation } },
      { body: { code: 1, msg: 'ok', result: inactive } },
      { body: { code: 1, msg: 'ok', result: batch } },
    ]);
    const linkPayload = relationPayload(relation);
    memStore.set('token', 'fixture-only');
    try {
      expect(await traceabilityRelationApi.link(linkPayload)).toEqual(relation);
      expect(await traceabilityRelationApi.unlink({ ...linkPayload, reason: '误关联' })).toEqual(inactive);
      const params = { objects: [relation.sourceObject, relation.targetObject, emptyObject], direction: 'BOTH' as const, relationTypes: [], activeOnly: true };
      expect(await traceabilityRelationApi.batchQuery(params)).toEqual(batch);
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      ['link', 'unlink', 'batch-query'].forEach((path, index) => {
        expect(calls[index][0]).toBe('/api/traceability/v1/relations/' + path);
        expect(calls[index][1].method).toBe('POST');
        expect(new Headers(calls[index][1].headers).get('token')).toBe(memStore.get('token'));
      });
      expect(JSON.parse(calls[0][1].body as string)).toEqual(linkPayload);
      expect(JSON.parse(calls[1][1].body as string)).toEqual({ ...linkPayload, reason: '误关联' });
      expect(JSON.parse(calls[2][1].body as string)).toEqual(params);
    } finally { memStore.delete('token'); }
  });
  it.each([10015, 10018, 10019])('业务错误 %s 保留通用提交错误，无自动 relink', async (code) => {
    const fetchMock = mockFetchSequence([{ body: { code, msg: '业务失败', result: null } }]);
    const error = await traceabilityRelationApi.link(relationPayload(relationFixture())).catch(error => error);
    expect(error).toBeInstanceOf(ApiBusinessError);
    expect(error.code).toBe(code);
    expect(toUserMessage(error)).toBe('业务失败');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  // 缺字段的真实状态/信封待联调。这里只验证合成的非字段错误展示边界。
  it.each(['sourceType', 'sourceId', 'relationType', 'targetType', 'targetId'])('缺 %s 的合成失败信封仍可显示', async (field) => {
    const invalid = { ...relationPayload(relationFixture()) } as Record<string, unknown>;
    delete invalid[field];
    mockFetchSequence([{ body: { code: 0, msg: '合成的通用失败', result: null } }]);
    const error = await traceabilityRelationApi.link(invalid as unknown as LinkRelationPayload).catch(error => error);
    expect(error).toBeInstanceOf(ApiBusinessError);
    expect(toUserMessage(error)).toBe('合成的通用失败');
  });
  it.each([
    { api: defectApi, endpoint: 'defect' },
    { api: testCaseApi, endpoint: 'testCase' },
  ])('$endpoint 候选仅分页与按 ID 读取', async ({ api, endpoint }) => {
    const row = { id: 3, title: '候选标题', projectId: 7 };
    const page = { list: [row], total: 1, pageNumber: 2, pageSize: 20 };
    const mock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: page } },
      { body: { code: 1, msg: 'ok', result: row } },
    ]);
    const params = { page: 2, pageSize: 20, bean: { projectId: 7, title: '候选' } };
    expect(await api.findByPage(params)).toEqual(page);
    expect(await api.findById(3)).toEqual(row);
    expect(mock.mock.calls[0][0]).toBe('/api/' + endpoint + '/v1/findByPage');
    expect(mock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual(params);
    expect(mock.mock.calls[1][0]).toBe('/api/' + endpoint + '/v1/findById/3');
    expect(mock.mock.calls[1][1].method).toBe('GET');
  });
});


describe('需求矩阵契约边界', () => {
  it('四类状态、精确requirementId、token、单次/api前缀和信封解包', async () => {
    memStore.set('token', 'matrix-token');
    const result = { list: [matrixFixture()], total: 1, pageNumber: 1, pageSize: 20 };
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result } }]);
    const params = { page: 1, pageSize: 20, bean: { projectId: 7, requirementId: 1, requirementStatus: 'DRAFT', taskStatus: 'COMPLETED', testCaseStatus: 'ACTIVE', defectStatus: 'RESOLVED' } };
    expect(await requirementTraceApi.findMatrix(params)).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/requirement/v1/trace/matrix/findByPage');
    expect(new Headers(init.headers).get('token')).toBe('matrix-token');
    expect(JSON.parse(init.body)).toEqual(params); memStore.delete('token');
  });
  it.each(['requirementStatus', 'taskStatus', 'testCaseStatus', 'defectStatus'])('%s命中/成功无命中保留后端行与摘要', async (field) => {
    const row = matrixFixture();
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { list: [row], total: 1, pageNumber: 1, pageSize: 20 } } },
      { body: { code: 1, msg: 'ok', result: { list: [], total: 0, pageNumber: 1, pageSize: 20 } } },
    ]);
    const statuses: Record<string, string> = { requirementStatus: 'DRAFT', taskStatus: 'COMPLETED', testCaseStatus: 'ACTIVE', defectStatus: 'RESOLVED' };
    const request = { page: 1, pageSize: 20, bean: { projectId: 7, [field]: statuses[field] } };
    expect((await requirementTraceApi.findMatrix(request)).list[0]).toEqual(row);
    expect((await requirementTraceApi.findMatrix({ ...request, bean: { projectId: 7, [field]: 'REVIEW' } })).total).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['权限不足', 'ARCHIVED 用例已失效', '分页数据不完整'])('业务失败%s不转空页', async (message) => {
    mockFetchSequence([{ body: { code: 40001, msg: message, result: null } }]);
    await expect(requirementTraceApi.findMatrix({ page: 1, pageSize: 20, bean: { projectId: 7 } })).rejects.toThrow(message);
  });
  it('网络失败与非法成功响应不转未覆盖', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('网络断开')));
    await expect(requirementTraceApi.findMatrix({ page: 1, pageSize: 20, bean: { projectId: 7 } })).rejects.toThrow('网络断开');
    mockFetchSequence([{ body: { code: 1, msg: 'ok', result: { list: [{ ...matrixFixture(), taskSummaries: null }], total: 1, pageNumber: 1, pageSize: 20 } } }]);
    await expect(requirementTraceApi.findMatrix({ page: 1, pageSize: 20, bean: { projectId: 7 } })).rejects.toThrow('响应契约错误');
  });
});
