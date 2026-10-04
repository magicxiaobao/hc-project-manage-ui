/**
 * Phase 2 测试用例列表/详情接入真实后端（p2-testcase-list-detail）测试：
 * - normalizeTestCaseListParams：page=1、pageSize=20 默认，bean.projectId 落位
 * - useTestCaseList：POST /testCase/v1/findByPage；projectId 为 null → disabled
 * - useTestCaseDetail：GET /testCase/v1/findById/{id}；id 无效 → disabled
 * - useCreateTestCase/useUpdateTestCase/useDuplicateTestCase/useArchiveTestCase：
 *   POST createTestCase/updateTestCase/duplicateTestCase/{id}/invalid/{id}
 * - queryKey 形状约定：['hc', 'testCase', 'list'|'detail', ...]
 * - testcase-form 纯函数：表单校验/载荷构建/回填
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/testcase-list.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import {
  normalizeTestCaseListParams,
  useArchiveTestCase,
  useCreateTestCase,
  useDuplicateTestCase,
  useTestCaseDetail,
  useTestCaseList,
  useUpdateTestCase,
} from '../hooks/useTestCases';
import { api } from '../../api/client';
import { testCaseApi } from '../../api/testCase';
import type { PageResult } from '../../api/types';
import type { TestCaseResponse } from '../../api/testCase-types';
import {
  allowedTargetStatuses,
  buildTestCaseCreatePayload,
  buildTestCaseUpdatePayload,
  canArchiveTestCase,
  checkEditSubmitVeto,
  editFormFromTestCase,
  emptyTestCaseFormInput,
  mergeSubmitFieldErrors,
  validateTestCaseFormInput,
} from '../../testcase-form';
import type { TestCaseFormInput } from '../../testcase-form';

function testCase(overrides: Partial<TestCaseResponse>): TestCaseResponse {
  return {
    id: 1,
    createdAt: null,
    updatedAt: null,
    title: '登录冒烟用例',
    description: null,
    caseNumber: 'TC-001',
    testType: '功能测试',
    priority: '高',
    status: 'ACTIVE',
    projectId: 7,
    testSuiteId: null,
    creatorId: null,
    assigneeId: null,
    preconditions: null,
    testSteps: '打开登录页',
    expectedResult: '登录成功',
    actualResult: null,
    testData: null,
    environmentRequirements: null,
    attachments: null,
    tags: null,
    estimatedDuration: null,
    actualDuration: null,
    lastExecutedAt: null,
    executionCount: 0,
    passCount: 0,
    failCount: 0,
    skipCount: 0,
    ...overrides,
  };
}

function pageResult(list: TestCaseResponse[]): PageResult<TestCaseResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

describe('useTestCaseList 参数归一化（走 hook 内部 normalizeTestCaseListParams）', () => {
  it('默认值：page=1、pageSize=20、bean.projectId 落位', () => {
    expect(normalizeTestCaseListParams({ projectId: 7 })).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });
  });

  it('筛选条件 title/caseNumber/testType/priority/status 全部进入 bean', () => {
    expect(
      normalizeTestCaseListParams({
        page: 2,
        pageSize: 20,
        bean: {
          title: '登录',
          caseNumber: 'TC-',
          testType: '功能测试',
          priority: '高',
          status: 'DRAFT',
        },
        projectId: 7,
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      bean: {
        projectId: 7,
        title: '登录',
        caseNumber: 'TC-',
        testType: '功能测试',
        priority: '高',
        status: 'DRAFT',
      },
    });
  });

  it('projectId 缺省 → bean.projectId=0（hook 的 enabled 门控会拦截请求）', () => {
    expect(normalizeTestCaseListParams().bean.projectId).toBe(0);
  });

  it('testCaseApi.findByPage 走 POST /testCase/v1/findByPage，请求体即归一化参数', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([testCase({ id: 3 })]));
    const client = createQueryClient();
    const params = normalizeTestCaseListParams({ projectId: 7 });
    const data = await client.fetchQuery({
      queryKey: queryKeys.testCase.list(params),
      queryFn: () => testCaseApi.findByPage(params),
    });
    expect(data.list[0]?.id).toBe(3);
    expect(postSpy).toHaveBeenCalledWith('/testCase/v1/findByPage', params);
  });

  it("queryKey 形状为 ['hc', 'testCase', 'list', params]", () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    expect(queryKeys.testCase.list(params)).toEqual(['hc', 'testCase', 'list', params]);
  });
});

describe('useTestCaseList 门控（SSR 冒烟：projectId 为 null 时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('projectId 为 null → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useTestCaseList({ projectId: null });
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

describe('useTestCaseDetail 详情接口', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('走 GET /testCase/v1/findById/{id}', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(testCase({ id: 9 }));
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.testCase.detail(9),
      queryFn: () => testCaseApi.findById(9),
    });
    expect(data.id).toBe(9);
    expect(getSpy).toHaveBeenCalledWith('/testCase/v1/findById/9');
  });

  it('id 为 null → disabled，不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(testCase({ id: 9 }));
    function Smoke() {
      const { isPending, fetchStatus } = useTestCaseDetail(null);
      return <div>{`pending:${String(isPending)} fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('pending:true');
    expect(html).toContain('fetch:idle');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("queryKey 形状为 ['hc', 'testCase', 'detail', id]", () => {
    expect(queryKeys.testCase.detail(9)).toEqual(['hc', 'testCase', 'detail', 9]);
  });
});

describe('用例写入 mutations 的 API 路径', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createTestCase → POST /testCase/v1/createTestCase', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(42);
    const id = await testCaseApi.createTestCase({
      title: 'x',
      projectId: 7,
      testType: '功能测试',
      priority: '高',
      status: 'DRAFT',
      testSteps: 'x',
      expectedResult: 'x',
    });
    expect(id).toBe(42);
    expect(postSpy).toHaveBeenCalledWith(
      '/testCase/v1/createTestCase',
      expect.objectContaining({ title: 'x', projectId: 7 }),
    );
  });

  it('updateTestCase → POST /testCase/v1/updateTestCase', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await testCaseApi.updateTestCase({ id: 5, title: '新标题' });
    expect(postSpy).toHaveBeenCalledWith(
      '/testCase/v1/updateTestCase',
      expect.objectContaining({ id: 5, title: '新标题' }),
    );
  });

  it('duplicateTestCase → POST /testCase/v1/duplicateTestCase/{id}', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(100);
    const newId = await testCaseApi.duplicateTestCase(5);
    expect(newId).toBe(100);
    expect(postSpy).toHaveBeenCalledWith('/testCase/v1/duplicateTestCase/5');
  });

  it('归档 = invalidTestCase → POST /testCase/v1/invalid/{id}', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await testCaseApi.invalidTestCase(5);
    expect(postSpy).toHaveBeenCalledWith('/testCase/v1/invalid/5');
  });
});

function validInput(): TestCaseFormInput {
  return {
    ...emptyTestCaseFormInput(),
    title: '登录冒烟用例',
    caseNumber: 'TC-001',
    testType: '功能测试',
    priority: '高',
    status: 'DRAFT',
    assigneeId: '12',
    preconditions: '系统正常运行',
    testSteps: '1. 打开登录页\n2. 输入账号密码',
    expectedResult: '登录成功跳转主页',
    testData: '',
    environmentRequirements: '',
    tags: '冒烟',
    estimatedDuration: '30',
    verifiesRequirementIdsText: '11,22',
  };
}

describe('validateTestCaseFormInput 字段级校验', () => {
  it('合法输入 → 零错误', () => {
    expect(validateTestCaseFormInput(validInput(), { includeVerifiesRequirementIds: true })).toEqual([]);
  });

  it('标题缺失/过短/过长', () => {
    expect(
      validateTestCaseFormInput({ ...validInput(), title: '  ' }),
    ).toContainEqual({ field: 'title', message: '标题不能为空' });
    expect(
      validateTestCaseFormInput({ ...validInput(), title: 'a' }),
    ).toContainEqual(expect.objectContaining({ field: 'title' }));
    expect(
      validateTestCaseFormInput({ ...validInput(), title: 'x'.repeat(201) }),
    ).toContainEqual(expect.objectContaining({ field: 'title' }));
  });

  it('用例编号缺失/过长/非法字符', () => {
    expect(
      validateTestCaseFormInput({ ...validInput(), caseNumber: '' }),
    ).toContainEqual({ field: 'caseNumber', message: '用例编号不能为空' });
    expect(
      validateTestCaseFormInput({ ...validInput(), caseNumber: 'TC 001' }),
    ).toContainEqual({ field: 'caseNumber', message: '用例编号仅支持字母、数字、下划线和连字符' });
    expect(
      validateTestCaseFormInput({ ...validInput(), caseNumber: 'x'.repeat(51) }),
    ).toContainEqual(expect.objectContaining({ field: 'caseNumber' }));
  });

  it('测试类型/优先级/状态缺失或非法', () => {
    expect(
      validateTestCaseFormInput({ ...validInput(), testType: '' }),
    ).toContainEqual({ field: 'testType', message: '测试类型不能为空' });
    expect(
      validateTestCaseFormInput({ ...validInput(), testType: '玄学测试' }),
    ).toContainEqual({ field: 'testType', message: '测试类型不在可选范围内' });
    expect(
      validateTestCaseFormInput({ ...validInput(), priority: '' }),
    ).toContainEqual({ field: 'priority', message: '优先级不能为空' });
    expect(
      validateTestCaseFormInput({ ...validInput(), status: 'ARCHIVED' }),
    ).toContainEqual({ field: 'status', message: '新建/编辑不支持归档状态' });
  });

  it('测试步骤/期望结果必填', () => {
    expect(
      validateTestCaseFormInput({ ...validInput(), testSteps: '' }),
    ).toContainEqual({ field: 'testSteps', message: '测试步骤不能为空' });
    expect(
      validateTestCaseFormInput({ ...validInput(), expectedResult: '' }),
    ).toContainEqual({ field: 'expectedResult', message: '期望结果不能为空' });
  });

  it('负责人 ID/预计时长格式', () => {
    expect(
      validateTestCaseFormInput({ ...validInput(), assigneeId: 'abc' }),
    ).toContainEqual({ field: 'assigneeId', message: '负责人 ID 必须为正整数' });
    expect(
      validateTestCaseFormInput({ ...validInput(), assigneeId: '' }),
    ).toEqual([]);
    expect(
      validateTestCaseFormInput({ ...validInput(), estimatedDuration: '0' }),
    ).toContainEqual(expect.objectContaining({ field: 'estimatedDuration' }));
    expect(
      validateTestCaseFormInput({ ...validInput(), estimatedDuration: '481' }),
    ).toContainEqual(expect.objectContaining({ field: 'estimatedDuration' }));
  });

  it('验证需求 ID：非法 token/超限；编辑模式不校验', () => {
    expect(
      validateTestCaseFormInput(
        { ...validInput(), verifiesRequirementIdsText: '12,x' },
        { includeVerifiesRequirementIds: true },
      ),
    ).toContainEqual(expect.objectContaining({ field: 'verifiesRequirementIdsText' }));
    // 编辑模式不渲染该栏，不校验（哪怕填了非法值也通过）
    expect(
      validateTestCaseFormInput({ ...validInput(), verifiesRequirementIdsText: '12,x' }),
    ).toEqual([]);
  });

  it('多错误一次收集（不首错即停）', () => {
    const errors = validateTestCaseFormInput({
      ...validInput(),
      title: '',
      caseNumber: '',
      testSteps: '',
    });
    expect(errors.map((error) => error.field)).toEqual(['title', 'caseNumber', 'testSteps']);
  });

  it('描述超长（2000）', () => {
    expect(
      validateTestCaseFormInput({ ...validInput(), description: 'x'.repeat(2001) }),
    ).toContainEqual(expect.objectContaining({ field: 'description' }));
  });
});

describe('buildTestCaseCreatePayload / buildTestCaseUpdatePayload', () => {
  it('新建载荷：字段完整，空文本转 undefined，验证需求去重', () => {
    const payload = buildTestCaseCreatePayload(
      { ...validInput(), verifiesRequirementIdsText: '11,22,11' },
      7,
    );
    expect(payload).toMatchObject({
      title: '登录冒烟用例',
      caseNumber: 'TC-001',
      testType: '功能测试',
      priority: '高',
      status: 'DRAFT',
      projectId: 7,
      assigneeId: 12,
      estimatedDuration: 30,
      verifiesRequirementIds: [11, 22],
    });
    expect(payload.testData).toBeUndefined();
    expect(payload.description).toBeUndefined();
  });

  it('新建载荷：非法枚举被白名单收窄（防外部篡改）', () => {
    const payload = buildTestCaseCreatePayload(
      { ...validInput(), testType: '玄学测试', priority: '超高', status: 'ARCHIVED' },
      7,
    );
    expect(payload.testType).toBe('功能测试');
    expect(payload.priority).toBe('中');
    expect(payload.status).toBe('DRAFT');
  });

  it('更新载荷：含 id，不含 verifiesRequirementIds（静默 no-op 陷阱）', () => {
    const payload = buildTestCaseUpdatePayload(5, validInput());
    expect(payload).toMatchObject({ id: 5, title: '登录冒烟用例' });
    expect(payload).not.toHaveProperty('verifiesRequirementIds');
    expect(payload).not.toHaveProperty('projectId');
  });

  it('更新载荷：description/可选文本恒发送 trim 字符串（空 = 清空，后端 `!= null` 支持写入空串）', () => {
    const payload = buildTestCaseUpdatePayload(5, {
      ...validInput(),
      description: '   ',
      assigneeId: '',
      estimatedDuration: '',
      preconditions: '   ',
      testData: '数据',
      environmentRequirements: '   ',
      tags: '',
    });
    // 恒发送口径（codex r4 P2）：用户清空已有值必须真实清空，不静默保留原值
    expect(payload.description).toBe('');
    expect(payload.preconditions).toBe('');
    expect(payload.testData).toBe('数据');
    expect(payload.environmentRequirements).toBe('');
    expect(payload.tags).toBe('');
    // 负责人/预计时长：后端只写非空值，空白 → undefined（保留原值）；
    // 清空已有值由校验显式拒绝，不静默忽略
    expect(payload.assigneeId).toBeUndefined();
    expect(payload.estimatedDuration).toBeUndefined();
  });

  it('编辑校验：清空已有预计时长被显式拒绝（codex r4 P2，口径同负责人）', () => {
    const errors = validateTestCaseFormInput(
      { ...validInput(), estimatedDuration: '  ' },
      { originalEstimatedDuration: '30' },
    );
    expect(errors).toContainEqual({
      field: 'estimatedDuration',
      message: '当前更新契约不支持清空预计时长',
    });
  });

  it('编辑校验：原本无预计时长时留空不报错；新建模式不检查原值', () => {
    const errors = validateTestCaseFormInput(
      { ...validInput(), estimatedDuration: '' },
      { originalEstimatedDuration: '' },
    );
    expect(errors.filter((e) => e.field === 'estimatedDuration')).toHaveLength(0);
    const createErrors = validateTestCaseFormInput({
      ...validInput(),
      estimatedDuration: '',
    });
    expect(createErrors.filter((e) => e.field === 'estimatedDuration')).toHaveLength(0);
  });

  it('编辑校验：清空已有负责人被显式拒绝（老前端 TestCaseForm.vue:105 口径）', () => {
    const errors = validateTestCaseFormInput(
      { ...validInput(), assigneeId: '  ' },
      { originalAssigneeId: '12' },
    );
    expect(errors).toContainEqual({
      field: 'assigneeId',
      message: '当前更新契约不支持清空负责人',
    });
  });

  it('编辑校验：原本无负责人时留空不报错；新建模式不检查原值', () => {
    const errors = validateTestCaseFormInput(
      { ...validInput(), assigneeId: '' },
      { originalAssigneeId: '' },
    );
    expect(errors.filter((e) => e.field === 'assigneeId')).toHaveLength(0);
    const createErrors = validateTestCaseFormInput({ ...validInput(), assigneeId: '' });
    expect(createErrors.filter((e) => e.field === 'assigneeId')).toHaveLength(0);
  });
});

describe('状态机门控（忠实后端 TestCaseStatusEnum.canTransitionTo）', () => {
  it('allowedTargetStatuses：按当前状态收敛目标', () => {
    expect(allowedTargetStatuses('DRAFT')).toEqual(['DRAFT', 'ACTIVE', 'REVIEW']);
    // ACTIVE→DRAFT 后端拒绝（TestCaseStatusEnum:69）
    expect(allowedTargetStatuses('ACTIVE')).toEqual(['ACTIVE', 'REVIEW']);
    expect(allowedTargetStatuses('REVIEW')).toEqual(['REVIEW', 'ACTIVE', 'DRAFT']);
    expect(allowedTargetStatuses('ARCHIVED')).toEqual([]);
  });

  it('canArchiveTestCase：只有草稿/生效用例可以归档（TestCaseServiceImpl.archiveTestCases）', () => {
    expect(canArchiveTestCase('DRAFT')).toBe(true);
    expect(canArchiveTestCase('ACTIVE')).toBe(true);
    expect(canArchiveTestCase('REVIEW')).toBe(false);
    expect(canArchiveTestCase('ARCHIVED')).toBe(false);
  });
});

describe('checkEditSubmitVeto 提交前复核（codex run137 的 3 项 P2）', () => {
  it('归属未验证 → 否决且不带字段（调用方走弹窗内持久错误通道）', () => {
    const veto = checkEditSubmitVeto({
      projectContextVerified: false,
      liveStatus: 'DRAFT',
      formStatus: 'DRAFT',
    });
    expect(veto).not.toBeNull();
    expect(veto!.field).toBeUndefined();
    expect(veto!.message).toContain('项目归属');
  });

  it('实时状态已归档 → 否决并指向 status 字段', () => {
    const veto = checkEditSubmitVeto({
      projectContextVerified: true,
      liveStatus: 'ARCHIVED',
      formStatus: 'DRAFT',
    });
    expect(veto).not.toBeNull();
    expect(veto!.field).toBe('status');
  });

  it('弹窗打开后状态变为 ACTIVE，表单仍为 DRAFT → 否决（ACTIVE 不可回 DRAFT）', () => {
    const veto = checkEditSubmitVeto({
      projectContextVerified: true,
      liveStatus: 'ACTIVE',
      formStatus: 'DRAFT',
    });
    expect(veto).not.toBeNull();
    expect(veto!.field).toBe('status');
    expect(veto!.message).toContain('已变为');
  });

  it('弹窗打开后状态变为 REVIEW，表单为 DRAFT → 通过（REVIEW 允许 DRAFT）', () => {
    expect(
      checkEditSubmitVeto({
        projectContextVerified: true,
        liveStatus: 'REVIEW',
        formStatus: 'DRAFT',
      }),
    ).toBeNull();
  });

  it('状态未变化 → 通过', () => {
    expect(
      checkEditSubmitVeto({
        projectContextVerified: true,
        liveStatus: 'DRAFT',
        formStatus: 'REVIEW',
      }),
    ).toBeNull();
  });

  it('无实时状态可复核（记录已从列表消失）→ 不拦截，后端为最终兜底', () => {
    expect(
      checkEditSubmitVeto({
        projectContextVerified: true,
        liveStatus: undefined,
        formStatus: 'DRAFT',
      }),
    ).toBeNull();
  });
});

describe('editFormFromTestCase 回填', () => {
  it('字段回填；ARCHIVED 回退为 DRAFT（写入侧不允许归档）', () => {
    const form = editFormFromTestCase(
      testCase({ id: 5, status: 'ARCHIVED', assigneeId: 9, estimatedDuration: 45 }),
    );
    expect(form.status).toBe('DRAFT');
    expect(form.assigneeId).toBe('9');
    expect(form.estimatedDuration).toBe('45');
    expect(form.caseNumber).toBe('TC-001');
  });
});

describe('hooks 导出完整（防止漏挂载）', () => {
  it('四个 mutation hooks 均可导入', () => {
    expect(typeof useCreateTestCase).toBe('function');
    expect(typeof useUpdateTestCase).toBe('function');
    expect(typeof useDuplicateTestCase).toBe('function');
    expect(typeof useArchiveTestCase).toBe('function');
  });
});

describe('mergeSubmitFieldErrors 提交错误合并（codex P2 r3 回归）', () => {
  it('复核字段错误与普通字段错误一次合并：未修正的字段错误不消失', () => {
    // 复现 codex P2 r3：DRAFT 弹窗清标题/步骤后保存 → {title, testSteps}；
    // 后台重取状态变 ACTIVE 后复核否决 status。旧实现只显示 {status}，
    // title/testSteps 的错误消失。新实现应一次显示三者。
    const merged = mergeSubmitFieldErrors(
      [
        { field: 'title', message: '标题必填' },
        { field: 'testSteps', message: '测试步骤必填' },
      ],
      { field: 'status', message: '用例状态已变为「执行中」' },
    );
    expect(merged).toEqual({
      title: '标题必填',
      testSteps: '测试步骤必填',
      status: '用例状态已变为「执行中」',
    });
  });

  it('复核通过时只返回普通字段错误；复核无字段（归属）时不影响字段错误', () => {
    expect(mergeSubmitFieldErrors([{ field: 'title', message: '标题必填' }], null)).toEqual({
      title: '标题必填',
    });
    expect(
      mergeSubmitFieldErrors([{ field: 'title', message: '标题必填' }], {
        message: '项目归属已变化',
      }),
    ).toEqual({ title: '标题必填' });
  });
});
