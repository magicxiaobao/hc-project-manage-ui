/**
 * Phase 2 测试轮列表 + 建轮 + 执行工作台（p2-testrun-workspace）测试：
 * - normalizeTestRunListParams：page=1、pageSize=20 默认；bean 携带 projectId
 *   或 versionId（后端"至少一个有效"，前端 fail-closed）
 * - useTestRunList 门控：projectId/versionId 均无效 → disabled，不发起请求
 * - testRunApi/testExecutionApi 路径与载荷（与后端 controller 只读核对）
 * - testrun-form 纯函数：建轮校验/载荷、完成执行校验、原因校验、
 *   执行缺陷校验/载荷
 *
 * 运行：pnpm vitest run src/lib/__tests__/testrun-workspace.test.tsx（已接入 pnpm run test:lib）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../query/client';
import { queryKeys } from '../query/keys';
import {
  normalizeTestRunListParams,
  useTestRunList,
} from '../query/hooks/useTestRuns';
import { api } from '../api/client';
import { testRunApi } from '../api/testRun';
import { testExecutionApi } from '../api/testExecution';
import type { PageResult } from '../api/types';
import type { TestRunResponse } from '../api/testRun-types';
import {
  buildAdHocPayload,
  buildCompleteExecutionPayload,
  buildCreateExecutionDefectPayload,
  buildFullRegressionPayload,
  buildLinkExistingDefectPayload,
  buildTargetedRetestPayload,
  emptyExecutionCompleteInput,
  emptyExecutionDefectInput,
  emptyTestRunCreateInput,
  utf8ByteLength,
  validateExecutionCompleteInput,
  validateExecutionDefectInput,
  validateReasonField,
  validateTestRunCreateInput,
} from '../testrun-form';
import type { TestRunCreateInput } from '../testrun-form';

function testRun(overrides: Partial<TestRunResponse>): TestRunResponse {
  return {
    id: 1,
    projectId: 7,
    runName: '回归轮',
    runType: 'FULL_REGRESSION',
    status: 'CREATED',
    environment: null,
    sourceRunId: null,
    versionId: null,
    scopeFingerprint: null,
    requiredCaseCount: null,
    startedBy: null,
    startedAt: null,
    completedBy: null,
    completedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function pageResult(list: TestRunResponse[]): PageResult<TestRunResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

function validCreateInput(
  overrides: Partial<TestRunCreateInput> = {},
): TestRunCreateInput {
  return {
    ...emptyTestRunCreateInput('FULL_REGRESSION'),
    runName: '登录回归轮',
    environment: 'staging',
    versionId: '42',
    ...overrides,
  };
}

describe('normalizeTestRunListParams 参数归一化', () => {
  it('默认值：page=1、pageSize=20、bean.projectId 落位', () => {
    expect(normalizeTestRunListParams({ projectId: 7 })).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });
  });

  it('versionId 单独也可作为 scope（后端允许二选一）', () => {
    expect(normalizeTestRunListParams({ versionId: 9 }).bean).toEqual({
      versionId: 9,
    });
  });

  it('筛选条件 runType/status 全部进入 bean', () => {
    const normalized = normalizeTestRunListParams({
      page: 2,
      bean: { runType: 'AD_HOC', status: 'RUNNING' },
      projectId: 7,
    });
    expect(normalized.bean).toEqual({
      projectId: 7,
      runType: 'AD_HOC',
      status: 'RUNNING',
    });
    expect(normalized.page).toBe(2);
  });

  it('projectId/versionId 均无效 → bean 为空对象（hook 的 enabled 门控拦截）', () => {
    expect(normalizeTestRunListParams().bean).toEqual({});
    expect(normalizeTestRunListParams({ projectId: null }).bean).toEqual({});
  });

  it("queryKey 形状为 ['hc', 'testRun', 'list'|'detail', ...]", () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    expect(queryKeys.testRun.list(params)).toEqual([
      'hc',
      'testRun',
      'list',
      params,
    ]);
    expect(queryKeys.testRun.detail(5)).toEqual(['hc', 'testRun', 'detail', 5]);
  });
});

describe('useTestRunList 门控（SSR 冒烟：scope 缺失时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('projectId/versionId 均缺省 → 不发起请求（后端必拒绝，前端 fail-closed）', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useTestRunList({});
      return <div>{`pending:${String(isPending)} fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('pending:true');
    expect(html).toContain('fetch:idle');
    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe('testRunApi 路径与载荷（忠实 TestRunController）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createFullRegression → POST /testRun/v1/full-regressions', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(testRun({ id: 11 }));
    const run = await testRunApi.createFullRegression({
      versionId: 42,
      runName: '回归',
    });
    expect(run.id).toBe(11);
    expect(postSpy).toHaveBeenCalledWith(
      '/testRun/v1/full-regressions',
      expect.objectContaining({ versionId: 42, runName: '回归' }),
    );
  });

  it('createAdHocRun → POST /testRun/v1/ad-hoc-runs', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(testRun({ id: 12 }));
    await testRunApi.createAdHocRun({
      projectId: 7,
      runName: '临时',
      selections: [{ selectionType: 'TEST_CASE', id: 101 }],
    });
    expect(postSpy).toHaveBeenCalledWith(
      '/testRun/v1/ad-hoc-runs',
      expect.objectContaining({ projectId: 7 }),
    );
  });

  it('createTargetedRetest → POST /testRun/v1/targeted-retests', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(testRun({ id: 13 }));
    await testRunApi.createTargetedRetest({
      sourceRunId: 5,
      sourceRunCaseIds: [201],
      runName: '复测',
    });
    expect(postSpy).toHaveBeenCalledWith(
      '/testRun/v1/targeted-retests',
      expect.objectContaining({ sourceRunId: 5 }),
    );
  });

  it('startRun/completeRun → POST /testRun/v1/{id}/start|complete（无请求体）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(testRun({ id: 5 }));
    await testRunApi.startRun(5);
    expect(postSpy).toHaveBeenCalledWith('/testRun/v1/5/start');
    await testRunApi.completeRun(5);
    expect(postSpy).toHaveBeenCalledWith('/testRun/v1/5/complete');
  });

  it('cancelRun → POST /testRun/v1/{id}/cancel，reason 先 trim', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(testRun({ id: 5 }));
    await testRunApi.cancelRun(5, { reason: '  范围变更  ' });
    expect(postSpy).toHaveBeenCalledWith('/testRun/v1/5/cancel', {
      reason: '范围变更',
    });
  });

  it('getDetail → GET /testRun/v1/{id}', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ run: testRun({ id: 5 }), cases: [] });
    await testRunApi.getDetail(5);
    expect(getSpy).toHaveBeenCalledWith('/testRun/v1/5');
  });

  it('findByPage → POST /testRun/v1/findByPage', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    await testRunApi.findByPage({ page: 1, pageSize: 20, bean: { projectId: 7 } });
    expect(postSpy).toHaveBeenCalledWith(
      '/testRun/v1/findByPage',
      expect.objectContaining({ bean: { projectId: 7 } }),
    );
  });
});

describe('testExecutionApi 路径与载荷（忠实 TestExecutionController）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('startExecution → POST /testExecution/v1/{id}/start（无请求体）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 7 });
    await testExecutionApi.startExecution(7);
    expect(postSpy).toHaveBeenCalledWith('/testExecution/v1/7/start');
  });

  it('completeExecution → POST /testExecution/v1/{id}/complete，result 必填', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 7 });
    await testExecutionApi.completeExecution(7, {
      result: 'FAILED',
      failureMessage: '闪退',
    });
    expect(postSpy).toHaveBeenCalledWith(
      '/testExecution/v1/7/complete',
      expect.objectContaining({ result: 'FAILED', failureMessage: '闪退' }),
    );
  });

  it('retryExecution → POST /testExecution/v1/{id}/retry，reason 先 trim', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ id: 8 });
    await testExecutionApi.retryExecution(7, { reason: '  环境已修复  ' });
    expect(postSpy).toHaveBeenCalledWith('/testExecution/v1/7/retry', {
      reason: '环境已修复',
    });
  });

  it('createDefectFromExecution → POST /testExecution/v1/{id}/defects', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ operation: 'CREATED' });
    await testExecutionApi.createDefectFromExecution(7, {
      title: '登录闪退',
      severity: 'MAJOR',
      priority: 'HIGH',
    });
    expect(postSpy).toHaveBeenCalledWith(
      '/testExecution/v1/7/defects',
      expect.objectContaining({ title: '登录闪退' }),
    );
  });

  it('linkExistingDefect → POST /testExecution/v1/{id}/defect-links { defectId }', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ operation: 'LINKED' });
    await testExecutionApi.linkExistingDefect(7, { defectId: 99 });
    expect(postSpy).toHaveBeenCalledWith('/testExecution/v1/7/defect-links', {
      defectId: 99,
    });
  });
});

describe('validateTestRunCreateInput 建轮校验', () => {
  it('合法的全量回归输入 → 无错误', () => {
    expect(validateTestRunCreateInput(validCreateInput())).toEqual([]);
  });

  it('收集全部错误：runName 为空 + versionId 非法 → 2 条', () => {
    const issues = validateTestRunCreateInput(
      validCreateInput({ runName: '  ', versionId: 'abc' }),
    );
    expect(issues.map((issue) => issue.field).sort()).toEqual([
      'runName',
      'versionId',
    ]);
  });

  it('runName 超 200 码点 → runName 错误', () => {
    const issues = validateTestRunCreateInput(
      validCreateInput({ runName: 'x'.repeat(201) }),
    );
    expect(issues.some((issue) => issue.field === 'runName')).toBe(true);
  });

  it('environment 超 255 码点 → environment 错误', () => {
    const issues = validateTestRunCreateInput(
      validCreateInput({ environment: 'e'.repeat(256) }),
    );
    expect(issues.some((issue) => issue.field === 'environment')).toBe(true);
  });

  it('AD_HOC 无选择 → adHocSelection 错误', () => {
    const issues = validateTestRunCreateInput(
      validCreateInput({ runType: 'AD_HOC', adHocSuiteIds: '', adHocCaseIds: ' ' }),
    );
    expect(issues.some((issue) => issue.field === 'adHocSelection')).toBe(true);
  });

  it('AD_HOC 用例非法 token → 错误归属 adHocCaseIds 并指出 token', () => {
    const issues = validateTestRunCreateInput(
      validCreateInput({ runType: 'AD_HOC', adHocCaseIds: '101, abc' }),
    );
    const issue = issues.find((entry) => entry.field === 'adHocCaseIds');
    expect(issue?.message).toContain('abc');
  });

  it('AD_HOC 套件非法 token → 错误归属 adHocSuiteIds', () => {
    const issues = validateTestRunCreateInput(
      validCreateInput({ runType: 'AD_HOC', adHocSuiteIds: 'xx' }),
    );
    const issue = issues.find((entry) => entry.field === 'adHocSuiteIds');
    expect(issue?.message).toContain('xx');
  });

  it('AD_HOC 合计超 200 项 → adHocSelection 错误', () => {
    const ids = Array.from({ length: 201 }, (_, index) => String(index + 1)).join(',');
    const issues = validateTestRunCreateInput(
      validCreateInput({ runType: 'AD_HOC', adHocCaseIds: ids }),
    );
    expect(issues.some((issue) => issue.field === 'adHocSelection')).toBe(true);
  });

  it('AD_HOC 合法选择 → 无错误', () => {
    expect(
      validateTestRunCreateInput(
        validCreateInput({ runType: 'AD_HOC', adHocSuiteIds: '12,12', adHocCaseIds: '101' }),
      ),
    ).toEqual([]);
  });

  it('TARGETED_RETEST：sourceRunId 非法 → 错误；来源用例为空 → 错误', () => {
    const issues = validateTestRunCreateInput(
      validCreateInput({ runType: 'TARGETED_RETEST', sourceRunId: '0', sourceRunCaseIds: '' }),
    );
    expect(issues.map((issue) => issue.field).sort()).toEqual([
      'sourceRunCaseIds',
      'sourceRunId',
    ]);
  });
});

describe('建轮载荷构建', () => {
  it('全量回归：trim；environment 为空时不带字段', () => {
    const payload = buildFullRegressionPayload(
      validCreateInput({ runName: '  回归  ', environment: '   ', versionId: '42' }),
    );
    expect(payload).toEqual({ versionId: 42, runName: '回归' });
  });

  it('即席：套件/用例去重并标注 selectionType', () => {
    const payload = buildAdHocPayload(
      validCreateInput({
        runType: 'AD_HOC',
        adHocSuiteIds: '12, 12',
        adHocCaseIds: '101,102',
      }),
      7,
    );
    expect(payload.projectId).toBe(7);
    expect(payload.selections).toEqual([
      { selectionType: 'TEST_SUITE', id: 12 },
      { selectionType: 'TEST_CASE', id: 101 },
      { selectionType: 'TEST_CASE', id: 102 },
    ]);
  });

  it('定向复测：sourceRunCaseIds 去重', () => {
    const payload = buildTargetedRetestPayload(
      validCreateInput({
        runType: 'TARGETED_RETEST',
        sourceRunId: '5',
        sourceRunCaseIds: '201, 201, 202',
      }),
    );
    expect(payload.sourceRunId).toBe(5);
    expect(payload.sourceRunCaseIds).toEqual([201, 202]);
  });
});

describe('validateExecutionCompleteInput 完成执行校验（后端三段规则）', () => {
  it('result 未选 → result 错误', () => {
    const issues = validateExecutionCompleteInput(emptyExecutionCompleteInput());
    expect(issues).toEqual([
      { field: 'result', message: '执行结果为必填项' },
    ]);
  });

  it('FAILED 无失败说明 → failureMessage 错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'FAILED',
    });
    expect(issues.some((issue) => issue.field === 'failureMessage')).toBe(true);
  });

  it('PASSED 带失败说明 → failureMessage 错误（后端直接拒绝）', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'PASSED',
      failureMessage: '不该填',
    });
    expect(issues.some((issue) => issue.field === 'failureMessage')).toBe(true);
  });

  it('SKIPPED 无执行备注 → executionNotes 错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'SKIPPED',
    });
    expect(issues.some((issue) => issue.field === 'executionNotes')).toBe(true);
  });

  it('overrideReason 超 500 码点 → 错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'PASSED',
      overrideReason: 'x'.repeat(501),
    });
    expect(issues.some((issue) => issue.field === 'overrideReason')).toBe(true);
  });

  it('合法 FAILED → 无错误；载荷只带非空字段', () => {
    const input = {
      ...emptyExecutionCompleteInput(),
      result: 'FAILED' as const,
      failureMessage: ' 闪退 ',
    };
    expect(validateExecutionCompleteInput(input)).toEqual([]);
    expect(buildCompleteExecutionPayload(input)).toEqual({
      result: 'FAILED',
      failureMessage: '闪退',
    });
  });
});

describe('r10 修复回归：完成执行校验收集全部错误（P2-7）', () => {
  it('result 未选 + overrideReason 超 500（UTF-16）→ 同时返回两条错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      overrideReason: 'x'.repeat(501),
    });
    expect(issues.map((issue) => issue.field).sort()).toEqual([
      'overrideReason',
      'result',
    ]);
  });

  it('result 未选 + failureMessage 超 65535 字节 → 同时返回 result 与 failureMessage 错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      failureMessage: 'x'.repeat(65536),
    });
    expect(issues.map((issue) => issue.field).sort()).toEqual([
      'failureMessage',
      'result',
    ]);
  });
});

describe('r10 修复回归：overrideReason 条件契约（P2-3）', () => {
  it('管理员覆盖（requireOverrideReason）且为空 → overrideReason 必填错误', () => {
    const issues = validateExecutionCompleteInput(
      { ...emptyExecutionCompleteInput(), result: 'PASSED' },
      { requireOverrideReason: true },
    );
    expect(
      issues.some((issue) => issue.field === 'overrideReason'),
    ).toBe(true);
  });

  it('本人完成（默认不强制）且为空 → 无 overrideReason 错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'PASSED',
    });
    expect(
      issues.some((issue) => issue.field === 'overrideReason'),
    ).toBe(false);
  });

  it('载荷：includeOverrideReason=false 时不发送 overrideReason（本人完成）', () => {
    const payload = buildCompleteExecutionPayload(
      {
        ...emptyExecutionCompleteInput(),
        result: 'PASSED',
        overrideReason: ' 误填 ',
      },
      { includeOverrideReason: false },
    );
    expect(payload).toEqual({ result: 'PASSED' });
    expect('overrideReason' in payload).toBe(false);
  });

  it('载荷：默认仍发送 overrideReason（管理员覆盖，向后兼容）', () => {
    const payload = buildCompleteExecutionPayload({
      ...emptyExecutionCompleteInput(),
      result: 'PASSED',
      overrideReason: ' 覆盖说明 ',
    });
    expect(payload.overrideReason).toBe('覆盖说明');
  });
});

describe('r10 修复回归：TEXT 字段 65535 UTF-8 字节上限（P2-9）', () => {
  it('utf8ByteLength：emoji 按 4 字节计', () => {
    expect(utf8ByteLength('😀')).toBe(4);
    expect(utf8ByteLength('abc')).toBe(3);
  });

  it('failureMessage 65536 字节 → 字段级错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'FAILED',
      failureMessage: 'x'.repeat(65536),
    });
    const issue = issues.find((entry) => entry.field === 'failureMessage');
    expect(issue?.message).toContain('65535');
  });

  it('failureMessage 恰 65535 字节 → 通过', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'FAILED',
      failureMessage: 'x'.repeat(65535),
    });
    expect(issues).toEqual([]);
  });

  it('16384 个 emoji（65536 字节）→ 字段级错误（字节口径非码点口径）', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'FAILED',
      failureMessage: '😀'.repeat(16384),
    });
    expect(
      issues.some((issue) => issue.field === 'failureMessage'),
    ).toBe(true);
  });
});

describe('r10 修复回归：长度按 UTF-16 码元与后端对齐（P2-8）', () => {
  it('runName：101 个 emoji（202 码元）→ 错误；100 个 emoji（200 码元）→ 通过', () => {
    expect(
      validateTestRunCreateInput(validCreateInput({ runName: '😀'.repeat(101) })).some(
        (issue) => issue.field === 'runName',
      ),
    ).toBe(true);
    expect(
      validateTestRunCreateInput(validCreateInput({ runName: '😀'.repeat(100) })),
    ).toEqual([]);
  });

  it('validateReasonField：251 个 emoji（502 码元）→ 错误；250 个（500 码元）→ 通过', () => {
    expect(validateReasonField('😀'.repeat(251)).length).toBe(1);
    expect(validateReasonField('😀'.repeat(250))).toEqual([]);
  });

  it('overrideReason：501 个 emoji（1002 码元）→ 错误', () => {
    const issues = validateExecutionCompleteInput({
      ...emptyExecutionCompleteInput(),
      result: 'PASSED',
      overrideReason: '😀'.repeat(501),
    });
    expect(
      issues.some((issue) => issue.field === 'overrideReason'),
    ).toBe(true);
  });
});

describe('validateReasonField 原因校验（取消轮/重试共用）', () => {
  it('空 → 错误', () => {
    expect(validateReasonField('   ')).toEqual([
      { field: 'reason', message: '原因为必填项（1–500 个字符）' },
    ]);
  });

  it('超 500 码点 → 错误', () => {
    expect(validateReasonField('x'.repeat(501)).length).toBe(1);
  });

  it('合法 → 无错误', () => {
    expect(validateReasonField('范围变更')).toEqual([]);
  });
});

describe('执行缺陷校验与载荷', () => {
  it('link 模式：defectId 非法 → 错误', () => {
    const issues = validateExecutionDefectInput({
      ...emptyExecutionDefectInput(),
      mode: 'link',
      defectId: 'abc',
    });
    expect(issues).toEqual([
      { field: 'defectId', message: '缺陷 ID 为必填项，请输入正整数' },
    ]);
  });

  it('link 模式合法 → 载荷 { defectId }', () => {
    const input = { ...emptyExecutionDefectInput(), mode: 'link' as const, defectId: '99' };
    expect(validateExecutionDefectInput(input)).toEqual([]);
    expect(buildLinkExistingDefectPayload(input)).toEqual({ defectId: 99 });
  });

  it('create 模式：标题为空 → title 错误', () => {
    const issues = validateExecutionDefectInput({
      ...emptyExecutionDefectInput(),
      title: '  ',
    });
    expect(issues.some((issue) => issue.field === 'title')).toBe(true);
  });

  it('create 模式：标题超 200 码点 → title 错误', () => {
    const issues = validateExecutionDefectInput({
      ...emptyExecutionDefectInput(),
      title: 'x'.repeat(201),
    });
    expect(issues.some((issue) => issue.field === 'title')).toBe(true);
  });

  it('create 载荷：trim 并丢弃空可选字段，severity/priority 透传枚举', () => {
    const payload = buildCreateExecutionDefectPayload({
      ...emptyExecutionDefectInput(),
      title: ' 闪退 ',
      description: '   ',
      defectType: '功能缺陷',
      severity: 'CRITICAL',
      priority: 'HIGH',
      reproductionSteps: ' 登录 ',
    });
    expect(payload).toEqual({
      title: '闪退',
      severity: 'CRITICAL',
      priority: 'HIGH',
      defectType: '功能缺陷',
      reproductionSteps: '登录',
    });
    expect('description' in payload).toBe(false);
  });
});
