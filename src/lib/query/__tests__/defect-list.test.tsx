/**
 * Phase 2 缺陷列表接入真实后端（p2-defect-list-create）测试：
 * - useDefectList：POST /defect/v1/findByPage，请求参数归一化
 *   （默认值 page=1、pageSize=20、bean={ projectId }）
 * - useDefectList 门控：projectId 为 null → disabled，不发起请求
 * - useDefectStatusOptions：GET /defect/v1/statusOptions（登录态门控）
 * - useCreateDefect：POST /defect/v1/createDefect，成功后失效缺陷域缓存
 * - queryKey 形状约定：['hc', 'defect', 'list'|'enums', ...]
 * - defect-create 纯函数：表单校验/ID 解析/载荷构建
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/defect-list.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import { normalizeListParams, useCreateDefect, useDefectList, useDefectStatusOptions } from '../hooks/useDefects';
import { useAuthStore } from '../../api/auth-store';
import { api } from '../../api/client';
import { defectApi } from '../../api/defect';
import type { PageResult } from '../../api/types';
import type {
  DefectCreatePayload,
  DefectResponse,
  DefectStatusOption,
} from '../../api/defect-types';
import {
  buildDefectCreatePayload,
  emptyDefectCreateFormInput,
  parseIdListText,
  validateDefectCreateInput,
} from '../../defect-create';
import { clampPageToTotal } from '../../pagination';

function defect(overrides: Partial<DefectResponse>): DefectResponse {
  return {
    id: 1,
    title: '演示缺陷',
    description: null,
    defectType: '功能',
    severity: 'MAJOR',
    priority: 'HIGH',
    status: 'NEW',
    statusLabel: null,
    projectId: 7,
    reporterId: null,
    assigneeId: null,
    testerId: null,
    foundDate: null,
    estimatedFixDate: null,
    actualFixDate: null,
    closedDate: null,
    reproductionSteps: null,
    expectedResult: null,
    actualResult: null,
    environment: null,
    attachments: null,
    tags: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function pageResult(list: DefectResponse[]): PageResult<DefectResponse> {
  return { list, total: list.length, pageNumber: 1, pageSize: 20 };
}

describe('useDefectList 参数归一化（走 hook 内部 normalizeListParams）', () => {
  it('默认值：page=1、pageSize=20、bean.projectId 落位', () => {
    expect(normalizeListParams({ projectId: 7 })).toEqual({
      page: 1,
      pageSize: 20,
      bean: { projectId: 7 },
    });
  });

  it('筛选条件 title/状态/严重度/优先级全部进入 bean', () => {
    expect(
      normalizeListParams({
        page: 2,
        pageSize: 20,
        bean: { title: '崩溃', status: 'NEW', severity: 'CRITICAL', priority: 'HIGH' },
        projectId: 7,
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      bean: { projectId: 7, title: '崩溃', status: 'NEW', severity: 'CRITICAL', priority: 'HIGH' },
    });
  });

  it('projectId 缺省 → bean.projectId=0（hook 的 enabled 门控会拦截请求）', () => {
    expect(normalizeListParams().bean.projectId).toBe(0);
  });

  it('defectApi.findByPage 走 POST /defect/v1/findByPage，请求体即归一化参数', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([defect({ id: 3 })]));
    const client = createQueryClient();
    const params = normalizeListParams({ projectId: 7 });
    const data = await client.fetchQuery({
      queryKey: queryKeys.defect.list(params),
      queryFn: () => defectApi.findByPage(params),
    });
    expect(data.list[0]?.id).toBe(3);
    expect(postSpy).toHaveBeenCalledWith('/defect/v1/findByPage', params);
  });

  it("queryKey 形状为 ['hc', 'defect', 'list', params]", () => {
    const params = { page: 1, pageSize: 20, bean: { projectId: 7 } };
    expect(queryKeys.defect.list(params)).toEqual(['hc', 'defect', 'list', params]);
  });
});

describe('useDefectList 门控（SSR 冒烟：projectId 为 null 时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('projectId 为 null → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(pageResult([]));
    function Smoke() {
      const { isPending, fetchStatus } = useDefectList({ projectId: null });
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

describe('useDefectStatusOptions 状态选项接口', () => {
  const OPTIONS: DefectStatusOption[] = [
    { value: 'NEW', label: '新建' },
    { value: 'ASSIGNED', label: '已指派' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ isAuthenticated: true });
  });

  it('走 GET /defect/v1/statusOptions', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(OPTIONS);
    const client = createQueryClient();
    const data = await client.fetchQuery({
      queryKey: queryKeys.defect.enums(),
      queryFn: () => defectApi.getStatusOptions(),
    });
    expect(data).toEqual(OPTIONS);
    expect(getSpy).toHaveBeenCalledWith('/defect/v1/statusOptions');
  });

  it("queryKey 形状为 ['hc', 'defect', 'enums']", () => {
    expect(queryKeys.defect.enums()).toEqual(['hc', 'defect', 'enums']);
  });

  it('未登录 → 不发起请求', () => {
    useAuthStore.setState({ isAuthenticated: false });
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(OPTIONS);
    function Smoke() {
      const { isPending, fetchStatus } = useDefectStatusOptions();
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
});

describe('defect-create 表单纯函数', () => {
  it('空标题 → 校验失败', () => {
    const input = { ...emptyDefectCreateFormInput(), title: '   ' };
    expect(validateDefectCreateInput(input)).toContain('标题不能为空');
  });

  it('非法关联 ID → 校验失败并指出非法 token', () => {
    const input = {
      ...emptyDefectCreateFormInput(),
      title: '崩溃',
      affectedRequirementIdsText: '12,abc',
      foundInTaskIdsText: '0',
    };
    const errors = validateDefectCreateInput(input);
    expect(errors.some((message) => message.includes('关联需求 ID 格式非法') && message.includes('abc'))).toBe(true);
    expect(errors.some((message) => message.includes('关联任务 ID 格式非法') && message.includes('0'))).toBe(true);
  });

  it('parseIdListText 支持逗号/中文逗号/空白分隔，去空 token', () => {
    const { ids, invalid } = parseIdListText(' 12, 34，56 78,,');
    expect(ids).toEqual([12, 34, 56, 78]);
    expect(invalid).toEqual([]);
  });

  it('parseIdListText 空输入 → 空数组无声通过', () => {
    expect(parseIdListText('   ')).toEqual({ ids: [], invalid: [] });
  });

  it('载荷构建：裁空白、空值传 null、默认 NORMAL/MEDIUM、ID 列表落位', () => {
    const input = {
      ...emptyDefectCreateFormInput(),
      title: '  登录页崩溃  ',
      defectType: '功能',
      severity: 'CRITICAL',
      priority: 'HIGH',
      environment: 'Chrome 130',
      description: ' ',
      reproductionSteps: '1. 打开登录页\n2. 点击登录',
      affectedRequirementIdsText: '12,34',
      foundInTaskIdsText: '56',
    };
    const payload: DefectCreatePayload = buildDefectCreatePayload(input, 7);
    expect(payload.title).toBe('登录页崩溃');
    expect(payload.defectType).toBe('功能');
    expect(payload.severity).toBe('CRITICAL');
    expect(payload.priority).toBe('HIGH');
    expect(payload.environment).toBe('Chrome 130');
    expect(payload.description).toBeNull();
    expect(payload.reproductionSteps).toBe('1. 打开登录页\n2. 点击登录');
    expect(payload.expectedResult).toBeNull();
    expect(payload.actualResult).toBeNull();
    expect(payload.affectedRequirementIds).toEqual([12, 34]);
    expect(payload.foundInTaskIds).toEqual([56]);
    expect(payload.projectId).toBe(7);
  });

  it('载荷构建：非法严重度/优先级被收窄为 NORMAL/MEDIUM', () => {
    const input = { ...emptyDefectCreateFormInput(), title: 'x', severity: 'P0', priority: 'URGENT' };
    const payload = buildDefectCreatePayload(input, 7);
    expect(payload.severity).toBe('NORMAL');
    expect(payload.priority).toBe('MEDIUM');
  });

  it('标题超过 200 字符 → 校验失败（后端 VARCHAR(200)）', () => {
    const input = { ...emptyDefectCreateFormInput(), title: 'x'.repeat(201) };
    expect(validateDefectCreateInput(input)).toContain('标题不能超过200个字符（后端 VARCHAR(200)）');
  });

  it('关联 ID 每侧超过 200 → 校验失败（后端 AlmBatchLimitExceeded）', () => {
    const many = Array.from({ length: 201 }, (_, i) => String(i + 1)).join(',');
    const input = {
      ...emptyDefectCreateFormInput(),
      title: '崩溃',
      affectedRequirementIdsText: many,
      foundInTaskIdsText: many,
    };
    const errors = validateDefectCreateInput(input);
    expect(errors).toContain('关联需求不能超过200个（后端约束）');
    expect(errors).toContain('关联任务不能超过200个（后端约束）');
  });

  it('载荷构建：关联 ID 去重（本次输入内部重复也要消掉）', () => {
    const input = {
      ...emptyDefectCreateFormInput(),
      title: 'x',
      affectedRequirementIdsText: '12,12,34',
    };
    const payload = buildDefectCreatePayload(input, 7);
    expect(payload.affectedRequirementIds).toEqual([12, 34]);
  });

  it('clampPageToTotal：越界回退到最后一页，范围内/空数据不动作', () => {
    expect(clampPageToTotal(2, 20, 20)).toBe(1);
    expect(clampPageToTotal(3, 21, 20)).toBe(2);
    expect(clampPageToTotal(1, 20, 20)).toBeNull();
    expect(clampPageToTotal(2, 21, 20)).toBeNull();
    expect(clampPageToTotal(2, 0, 20)).toBe(1);
  });
});

describe('useCreateDefect 数据链路（mock api.post）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('提交载荷并返回新建 id，成功后缺陷域与需求域缓存均被失效', async () => {
    const payload: DefectCreatePayload = {
      title: '登录页崩溃',
      defectType: '功能',
      severity: 'CRITICAL',
      priority: 'HIGH',
      projectId: 7,
      affectedRequirementIds: [12],
      foundInTaskIds: [],
    };
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(42);
    const client = createQueryClient();
    // 预置列表缓存，验证失效确实命中缺陷域
    const listKey = queryKeys.defect.list({ page: 1, pageSize: 20, bean: { projectId: 7 } });
    client.setQueryData(listKey, pageResult([]));
    // 预置需求追溯缓存：缺陷的新建/关联会改变追溯图，必须一并失效
    const traceKey = queryKeys.requirement.enums();
    client.setQueryData(traceKey, []);
    let mutateAsync: ((data: DefectCreatePayload) => Promise<number>) | null = null;
    function SmokeCreate() {
      const mutation = useCreateDefect();
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
    expect(postSpy).toHaveBeenCalledWith('/defect/v1/createDefect', payload);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(traceKey)?.isInvalidated).toBe(true);
  });
});
