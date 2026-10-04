/**
 * Phase 2 测试套件列表/详情接入真实后端（p2-testsuite-live）测试：
 * - normalizeTestSuiteListParams：page=1、pageSize=20 默认，bean.projectId 落位
 * - useTestSuiteList：POST /testSuite/v1/findByPage；projectId 为 null → disabled
 * - useTestSuiteDetail：GET /testSuite/v1/findById/{id}；id 无效 → disabled
 * - useCreateTestSuite/useUpdateTestSuite/useValidTestSuite/useInvalidTestSuite：
 *   POST createTestSuite/updateTestSuite/valid/{id}/invalid/{id}
 * - queryKey 形状约定：['hc', 'testSuite', 'list'|'detail', ...]
 * - testsuite-form 纯函数：表单校验/载荷构建/回填
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/testsuite-list.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import {
  normalizeTestSuiteListParams,
  useCreateTestSuite,
  useInvalidTestSuite,
  useTestSuiteDetail,
  useTestSuiteList,
  useUpdateTestSuite,
  useValidTestSuite,
} from '../hooks/useTestSuites';
import { api } from '../../api/client';
import { testSuiteApi } from '../../api/testSuite';
import type { PageResult } from '../../api/types';
import type { TestSuiteResponse } from '../../api/testSuite-types';
import {
  buildTestSuiteCreatePayload,
  buildTestSuiteUpdatePayload,
  editFormFromTestSuite,
  emptyTestSuiteFormInput,
  validateTestSuiteFormInput,
} from '../../testsuite-form';
import type { TestSuiteFormInput } from '../../testsuite-form';

function testSuite(overrides: Partial<TestSuiteResponse>): TestSuiteResponse {
  return {
    id: 1,
    createdAt: null,
    updatedAt: null,
    suiteName: '登录回归套件',
    projectId: 7,
    description: null,
    suiteType: '回归测试',
    status: 'ACTIVE',
    priority: '高',
    estimatedTime: null,
    actualTime: null,
    passRate: null,
    totalCases: 0,
    passedCases: 0,
    failedCases: 0,
    skippedCases: 0,
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function pageResult(list: TestSuiteResponse[]): PageResult<TestSuiteResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

function validInput(overrides: Partial<TestSuiteFormInput> = {}): TestSuiteFormInput {
  return {
    ...emptyTestSuiteFormInput(),
    suiteName: '登录回归套件',
    suiteType: '回归测试',
    status: 'ACTIVE',
    priority: '高',
    ...overrides,
  };
}

describe('useTestSuiteList 参数归一化（走 hook 内部 normalizeTestSuiteListParams）', () => {
  it('默认值：page=1、pageSize=20、bean.projectId 落位', () => {
    expect(normalizeTestSuiteListParams({ projectId: 7 })).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });
  });

  it('筛选条件 suiteName/suiteType/status 全部进入 bean', () => {
    expect(
      normalizeTestSuiteListParams({
        page: 2,
        pageSize: 20,
        bean: { suiteName: '登录', suiteType: '回归测试', status: 'ACTIVE' },
        projectId: 7,
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      bean: { projectId: 7, suiteName: '登录', suiteType: '回归测试', status: 'ACTIVE' },
    });
  });

  it('projectId 缺省 → bean.projectId=0（hook 的 enabled 门控会拦截请求）', () => {
    expect(normalizeTestSuiteListParams().bean.projectId).toBe(0);
  });

  it('testSuiteApi.findByPage 走 POST /testSuite/v1/findByPage，请求体即归一化参数', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([testSuite({ id: 3 })]));
    const client = createQueryClient();
    const params = normalizeTestSuiteListParams({ projectId: 7 });
    const data = await client.fetchQuery({
      queryKey: queryKeys.testSuite.list(params),
      queryFn: () => testSuiteApi.findByPage(params),
    });
    expect(data.list[0]?.id).toBe(3);
    expect(postSpy).toHaveBeenCalledWith('/testSuite/v1/findByPage', params);
  });

  it("queryKey 形状为 ['hc', 'testSuite', 'list', params]", () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    expect(queryKeys.testSuite.list(params)).toEqual(['hc', 'testSuite', 'list', params]);
  });
});

describe('useTestSuiteList 门控（SSR 冒烟：projectId 为 null 时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('projectId 为 null → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useTestSuiteList({ projectId: null });
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

describe('useTestSuiteDetail 详情接口', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('走 GET /testSuite/v1/findById/{id}', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(testSuite({ id: 9 }));
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.testSuite.detail(9),
      queryFn: () => testSuiteApi.findById(9),
    });
    expect(data.id).toBe(9);
    expect(getSpy).toHaveBeenCalledWith('/testSuite/v1/findById/9');
  });

  it('id 为 null → disabled，不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(testSuite({ id: 9 }));
    function Smoke() {
      const { isPending, fetchStatus } = useTestSuiteDetail(null);
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

  it("queryKey 形状为 ['hc', 'testSuite', 'detail', id]", () => {
    expect(queryKeys.testSuite.detail(9)).toEqual(['hc', 'testSuite', 'detail', 9]);
  });
});

describe('套件写入 mutations 的 API 路径', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createTestSuite → POST /testSuite/v1/createTestSuite', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(42);
    const id = await testSuiteApi.createTestSuite({
      suiteName: 'x',
      projectId: 7,
      suiteType: '回归测试',
      status: 'DRAFT',
      priority: '高',
    });
    expect(id).toBe(42);
    expect(postSpy).toHaveBeenCalledWith(
      '/testSuite/v1/createTestSuite',
      expect.objectContaining({ suiteName: 'x', projectId: 7 }),
    );
  });

  it('updateTestSuite → POST /testSuite/v1/updateTestSuite', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await testSuiteApi.updateTestSuite({ id: 5, suiteName: '新名称' });
    expect(postSpy).toHaveBeenCalledWith(
      '/testSuite/v1/updateTestSuite',
      expect.objectContaining({ id: 5, suiteName: '新名称' }),
    );
  });

  it('validTestSuite → POST /testSuite/v1/valid/{id}', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await testSuiteApi.validTestSuite(5);
    expect(postSpy).toHaveBeenCalledWith('/testSuite/v1/valid/5');
  });

  it('invalidTestSuite → POST /testSuite/v1/invalid/{id}', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await testSuiteApi.invalidTestSuite(5);
    expect(postSpy).toHaveBeenCalledWith('/testSuite/v1/invalid/5');
  });
});

describe('validateTestSuiteFormInput 字段级校验', () => {
  it('合法输入 → 无错误', () => {
    expect(validateTestSuiteFormInput(validInput())).toEqual([]);
  });

  it('套件名称：空/过短/过长均报错', () => {
    expect(validateTestSuiteFormInput(validInput({ suiteName: '' }))).toContainEqual(
      expect.objectContaining({ field: 'suiteName' }),
    );
    expect(validateTestSuiteFormInput(validInput({ suiteName: 'x' }))).toContainEqual(
      expect.objectContaining({ field: 'suiteName' }),
    );
    expect(validateTestSuiteFormInput(validInput({ suiteName: 'x'.repeat(101) }))).toContainEqual(
      expect.objectContaining({ field: 'suiteName' }),
    );
  });

  it('套件类型/状态/优先级：空或不在白名单均报错', () => {
    expect(validateTestSuiteFormInput(validInput({ suiteType: '' }))).toContainEqual(
      expect.objectContaining({ field: 'suiteType' }),
    );
    expect(validateTestSuiteFormInput(validInput({ suiteType: '冒烟' }))).toContainEqual(
      expect.objectContaining({ field: 'suiteType' }),
    );
    expect(validateTestSuiteFormInput(validInput({ status: 'UNKNOWN' }))).toContainEqual(
      expect.objectContaining({ field: 'status' }),
    );
    expect(validateTestSuiteFormInput(validInput({ priority: '' }))).toContainEqual(
      expect.objectContaining({ field: 'priority' }),
    );
  });

  it('八态 status 全在白名单内：IN_PROGRESS/EXECUTING/PAUSED 等合法', () => {
    for (const status of ['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'EXECUTING', 'PAUSED', 'COMPLETED', 'DEPRECATED', 'CLOSED']) {
      expect(validateTestSuiteFormInput(validInput({ status }))).toEqual([]);
    }
  });

  it('预计/实际耗时：非正整数报错；留空不报错', () => {
    expect(validateTestSuiteFormInput(validInput({ estimatedTime: '0' }))).toContainEqual(
      expect.objectContaining({ field: 'estimatedTime' }),
    );
    expect(validateTestSuiteFormInput(validInput({ actualTime: 'abc' }))).toContainEqual(
      expect.objectContaining({ field: 'actualTime' }),
    );
    expect(validateTestSuiteFormInput(validInput({ estimatedTime: '', actualTime: '' }))).toEqual([]);
  });

  it('编辑清空已有耗时 → 显式拒绝（codex r4 P2 口径，不静默保留）', () => {
    expect(
      validateTestSuiteFormInput(validInput({ estimatedTime: '' }), { originalEstimatedTime: '60' }),
    ).toContainEqual(expect.objectContaining({ field: 'estimatedTime' }));
    expect(
      validateTestSuiteFormInput(validInput({ actualTime: '' }), { originalActualTime: '45' }),
    ).toContainEqual(expect.objectContaining({ field: 'actualTime' }));
    // 新建（无原始值）留空不报错
    expect(validateTestSuiteFormInput(validInput({ estimatedTime: '' }))).toEqual([]);
  });

  it('收集全部错误：多字段同时非法一次返回', () => {
    const errors = validateTestSuiteFormInput(
      validInput({ suiteName: '', suiteType: 'x', estimatedTime: 'abc' }),
    );
    const fields = errors.map((error) => error.field);
    expect(fields).toContain('suiteName');
    expect(fields).toContain('suiteType');
    expect(fields).toContain('estimatedTime');
  });
});

describe('buildTestSuiteCreatePayload / buildTestSuiteUpdatePayload', () => {
  it('新建载荷：空文本 → undefined（后端只应用非空字段）', () => {
    const payload = buildTestSuiteCreatePayload(validInput({ description: '  ', estimatedTime: '' }), 7);
    expect(payload).toEqual({
      suiteName: '登录回归套件',
      projectId: 7,
      description: undefined,
      suiteType: '回归测试',
      status: 'ACTIVE',
      priority: '高',
      estimatedTime: undefined,
      actualTime: undefined,
    });
  });

  it('更新载荷：description 恒发送 trim 字符串（\'\' = 清空，后端非空即应用）', () => {
    const payload = buildTestSuiteUpdatePayload(5, validInput({ description: '  ', estimatedTime: '60' }));
    expect(payload.id).toBe(5);
    expect(payload.description).toBe('');
    expect(payload.estimatedTime).toBe(60);
  });
});

describe('editFormFromTestSuite 回填', () => {
  it('Response 字段回填为表单字符串；null → 空串', () => {
    const form = editFormFromTestSuite(
      testSuite({ description: 'd', estimatedTime: 60, actualTime: null }),
    );
    expect(form.suiteName).toBe('登录回归套件');
    expect(form.description).toBe('d');
    expect(form.estimatedTime).toBe('60');
    expect(form.actualTime).toBe('');
  });
});

describe('hooks 导出完整（防止漏挂载）', () => {
  it('useTestSuites 全部 hooks 可导入', () => {
    expect(typeof useTestSuiteList).toBe('function');
    expect(typeof useTestSuiteDetail).toBe('function');
    expect(typeof useCreateTestSuite).toBe('function');
    expect(typeof useUpdateTestSuite).toBe('function');
    expect(typeof useValidTestSuite).toBe('function');
    expect(typeof useInvalidTestSuite).toBe('function');
    expect(typeof normalizeTestSuiteListParams).toBe('function');
  });
});
