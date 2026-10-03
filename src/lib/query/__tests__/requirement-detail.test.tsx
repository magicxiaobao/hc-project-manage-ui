/**
 * Phase 1 需求详情接入真实后端（p1-requirement-detail）测试：
 * - transitionFieldRequirements 纯函数：目标态 → 附加字段要求
 *   （忠实于后端 RequirementWorkflowServiceImpl：IN_DEVELOPMENT 需负责人+实际开始日期，
 *   COMPLETED 需实际结束日期）
 * - API 契约：executeStatusTransition 走 POST /requirement/v1/status/transition；
 *   getAllowedTransitions 走 GET /requirement/v1/status/allowed/{id}/{status}；
 *   getTransitionHistory 走 GET /requirement/v1/status/history/{id}；
 *   createComment 走 POST /comment/v1/target/REQUIREMENT/{id}/create（封闭合同，仅 content/parentId）；
 *   findComments 走 POST /comment/v1/target/REQUIREMENT/{id}/find（封闭合同，仅 page/pageSize）
 * - queryKey 形状：['hc', 'requirement', 'allowed'|'history'|'comments', ...]
 * - useRequirementDetail 门控：id 为 null → disabled，不发起请求
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/requirement-detail.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import {
  transitionFieldRequirements,
  useAllowedTransitions,
  useRequirementDetail,
  useTransitionHistory,
  useRequirementComments,
} from '../hooks/useRequirements';
import { api } from '../../api/client';
import { requirementApi } from '../../api/requirement';
import type { PageResult } from '../../api/types';
import type {
  CommentView,
  RequirementTransitionHistory,
  RequirementTransitionPayload,
} from '../../api/requirement-types';

function history(overrides: Partial<RequirementTransitionHistory> = {}): RequirementTransitionHistory {
  return {
    requirementId: 7,
    currentStatus: 'DRAFT',
    transitions: [],
    total: 0,
    allowedTransitions: ['REVIEW', 'CANCELLED'],
    ...overrides,
  };
}

function comment(overrides: Partial<CommentView> = {}): CommentView {
  return {
    id: 11,
    content: '看起来没问题',
    targetType: 'REQUIREMENT',
    targetId: 7,
    parentId: null,
    creatorId: 3,
    createdAt: 1728000000,
    updatedAt: 1728000000,
    ...overrides,
  };
}

function commentPage(list: CommentView[]): PageResult<CommentView> {
  return { list, total: list.length, pageNumber: 1, pageSize: 50 };
}

describe('transitionFieldRequirements 目标态附加字段要求', () => {
  it('IN_DEVELOPMENT → 需要负责人 + 实际开始日期', () => {
    expect(transitionFieldRequirements('IN_DEVELOPMENT')).toEqual({
      requireAssignee: true,
      requireDate: true,
      dateField: 'actualStartDate',
      dateLabel: '实际开始日期',
    });
  });

  it('COMPLETED → 只需要实际结束日期', () => {
    expect(transitionFieldRequirements('COMPLETED')).toEqual({
      requireAssignee: false,
      requireDate: true,
      dateField: 'actualEndDate',
      dateLabel: '实际结束日期',
    });
  });

  it('其它目标态（REVIEW/APPROVED/CANCELLED）→ 无附加必填字段', () => {
    for (const toStatus of ['REVIEW', 'APPROVED', 'CANCELLED', 'DRAFT']) {
      expect(transitionFieldRequirements(toStatus)).toEqual({
        requireAssignee: false,
        requireDate: false,
        dateField: null,
        dateLabel: null,
      });
    }
  });
});

describe('需求状态流转 API 契约', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('executeStatusTransition 走 POST /requirement/v1/status/transition，载荷原样透传', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    const payload: RequirementTransitionPayload = {
      requirementId: 7,
      toStatus: 'IN_DEVELOPMENT',
      reason: '评审通过，开始开发',
      assigneeId: 3,
      actualStartDate: '2026-10-04',
    };
    const result = await requirementApi.executeStatusTransition(payload);
    expect(result).toBe('ok');
    expect(postSpy).toHaveBeenCalledWith('/requirement/v1/status/transition', payload);
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('executeStatusTransition 可选字段缺省时不发送（封闭请求体）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await requirementApi.executeStatusTransition({ requirementId: 7, toStatus: 'CANCELLED' });
    expect(postSpy).toHaveBeenCalledWith('/requirement/v1/status/transition', {
      requirementId: 7,
      toStatus: 'CANCELLED',
    });
  });

  it('getAllowedTransitions 走 GET /requirement/v1/status/allowed/{id}/{status}', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(['REVIEW', 'CANCELLED']);
    const allowed = await requirementApi.getAllowedTransitions(7, 'DRAFT');
    expect(allowed).toEqual(['REVIEW', 'CANCELLED']);
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/status/allowed/7/DRAFT');
  });

  it('getTransitionHistory 走 GET /requirement/v1/status/history/{id}', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(history());
    const result = await requirementApi.getTransitionHistory(7);
    expect(result.allowedTransitions).toEqual(['REVIEW', 'CANCELLED']);
    expect(getSpy).toHaveBeenCalledWith('/requirement/v1/status/history/7');
  });
});

describe('需求评论 API 契约（comment/v1 线程）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createComment 走 POST /comment/v1/target/REQUIREMENT/{id}/create，请求体仅 content/parentId', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(11);
    const id = await requirementApi.createComment(7, { content: '看起来没问题', parentId: null });
    expect(id).toBe(11);
    expect(postSpy).toHaveBeenCalledWith('/comment/v1/target/REQUIREMENT/7/create', {
      content: '看起来没问题',
      parentId: null,
    });
  });

  it('createComment 回复时透传 parentId', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(12);
    await requirementApi.createComment(7, { content: '同意', parentId: 11 });
    expect(postSpy).toHaveBeenCalledWith('/comment/v1/target/REQUIREMENT/7/create', {
      content: '同意',
      parentId: 11,
    });
  });

  it('findComments 走 POST /comment/v1/target/REQUIREMENT/{id}/find，请求体仅 page/pageSize', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(commentPage([comment()]));
    const page = await requirementApi.findComments(7, { page: 1, pageSize: 50 });
    expect(page.list[0]?.content).toBe('看起来没问题');
    expect(postSpy).toHaveBeenCalledWith('/comment/v1/target/REQUIREMENT/7/find', {
      page: 1,
      pageSize: 50,
    });
  });
});

describe('需求详情 queryKey 形状约定', () => {
  it("allowed 形状为 ['hc', 'requirement', 'allowed', id, status]", () => {
    expect(queryKeys.requirement.allowed(7, 'DRAFT')).toEqual(['hc', 'requirement', 'allowed', 7, 'DRAFT']);
  });

  it("history 形状为 ['hc', 'requirement', 'history', id]", () => {
    expect(queryKeys.requirement.history(7)).toEqual(['hc', 'requirement', 'history', 7]);
  });

  it("comments 形状为 ['hc', 'requirement', 'comments', id, params]", () => {
    const params = { page: 1, pageSize: 50 };
    expect(queryKeys.requirement.comments(7, params)).toEqual(['hc', 'requirement', 'comments', 7, params]);
  });

  it("detail 形状为 ['hc', 'requirement', 'detail', id]", () => {
    expect(queryKeys.requirement.detail(7)).toEqual(['hc', 'requirement', 'detail', 7]);
  });
});

describe('需求详情 hooks 门控（SSR 冒烟：id 无效时不发起请求）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('useRequirementDetail(null) → 不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(null);
    function Smoke() {
      const { isPending, fetchStatus } = useRequirementDetail(null);
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

  it('useAllowedTransitions(id 为 null) → 不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue([]);
    function Smoke() {
      const { fetchStatus } = useAllowedTransitions(null, 'DRAFT');
      return <div>{`fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('fetch:idle');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('useTransitionHistory(0) → 不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue(history());
    function Smoke() {
      const { fetchStatus } = useTransitionHistory(0);
      return <div>{`fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('fetch:idle');
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('useRequirementComments(id 为 null) → 不发起请求', () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue(commentPage([]));
    function Smoke() {
      const { fetchStatus } = useRequirementComments(null);
      return <div>{`fetch:${fetchStatus}`}</div>;
    }
    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <Smoke />
      </QueryClientProvider>,
    );
    expect(html).toContain('fetch:idle');
    expect(postSpy).not.toHaveBeenCalled();
  });
});
