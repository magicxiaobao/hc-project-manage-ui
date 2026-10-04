/**
 * P2 缺陷详情 + 状态流转 + 严重度（p2-defect-detail-flow）测试：
 * - defectTransitionTargets 纯函数：状态机拓扑
 *   （忠实于后端 DefectStateMachineConfig 拓扑，老前端 DEFECT_TRANSITIONS_BY_STATUS 镜像一致；
 *   后端拓扑唯一权威，REJECTED→NEW 的 ASSIGN 边必需处理人 ID）
 * - defectNeedsReason：后端 DefectWorkflowService.transitionDefect 的原因规则
 *   （→REJECTED/→REOPEN/→CLOSED/→PENDING_VERIFICATION/→RESOLVED 必填；
 *   TESTING→IN_PROGRESS 必填；指派边原因可选——老前端把 ASSIGNED 也标成必填，
 *   那是老前端自己的严格策略，后端不强制，此处按后端）
 * - defectNeedsActor：requireAssignee（→ASSIGNED/→NEW）/ requireTester（→TESTING）/
 *   requireVerifier（→VERIFIED）
 * - defectTransitionLabel：忠实于老前端 getDefectTransitionLabel 的按钮文案
 * - API 契约：updateDefect 走 POST /defect/v1/updateDefect（严重度与状态不在此入口）；
 *   updateStatus 走 POST /defect/v1/updateStatus（载荷 { id, status, … }）；
 *   changeSeverity 走 POST /defect/v1/{defectId}/severity（CAS，reason 客户端先 trim）
 * - queryKey 形状：['hc', 'defect', 'detail', id]
 * - useDefectDetail 门控：id 为 null/无效 → disabled，不发起请求
 * - buildDefectUpdatePayload：标题 trim、空文本→null（后端 null-skip 语义）、
 *   reporterId 留空→null、attachments 刻意省略（不覆盖并发附件变更）
 * - buildChangeDefectSeverityOptions：onError 失效详情查询（CAS 冲突后回取可重试）；
 *   onSuccess 失效缺陷域 + 需求域
 * - →VERIFIED 验证人取当前登录用户（后端用 operatorId 覆盖），defectNeedsActor
 *   仍返回 'verifier'（requireVerifier fail-fast 仍需携带）
 *
 * 运行：pnpm vitest run src/lib/query/__tests__/defect-detail.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../client';
import { queryKeys } from '../keys';
import {
  DEFECT_TRANSITIONS_BY_STATUS,
  buildChangeDefectSeverityOptions,
  defectNeedsActor,
  defectNeedsReason,
  defectTransitionLabel,
  defectTransitionTargets,
  useDefectDetail,
} from '../hooks/useDefects';
import { api } from '../../api/client';
import { defectApi } from '../../api/defect';
import type { DefectStatus } from '../../api/defect-types';
import { buildDefectUpdatePayload, editFormFromDefect } from '../../defect-detail';

const EXPECTED_TOPOLOGY: Record<DefectStatus, DefectStatus[]> = {
  NEW: ['ASSIGNED', 'REJECTED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING_VERIFICATION', 'TESTING'],
  PENDING_VERIFICATION: ['RESOLVED', 'REJECTED'],
  TESTING: ['RESOLVED', 'REJECTED', 'IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'VERIFIED', 'REOPEN'],
  CLOSED: ['REOPEN'],
  REOPEN: ['IN_PROGRESS'],
  VERIFIED: ['CLOSED', 'REOPEN'],
  REJECTED: ['REOPEN', 'NEW'],
};

describe('缺陷状态流转拓扑（defectTransitionTargets）', () => {
  it('与后端 DefectStateMachineConfig 拓扑一致', () => {
    expect(DEFECT_TRANSITIONS_BY_STATUS).toEqual(EXPECTED_TOPOLOGY);
  });

  it('每种状态返回正确的可达目标', () => {
    for (const [from, expected] of Object.entries(EXPECTED_TOPOLOGY)) {
      expect(defectTransitionTargets(from)).toEqual(expected);
    }
  });

  it('未知状态 / null → 空列表（不渲染流转按钮）', () => {
    expect(defectTransitionTargets('WHATEVER')).toEqual([]);
    expect(defectTransitionTargets(null)).toEqual([]);
    expect(defectTransitionTargets(undefined)).toEqual([]);
  });
});

describe('流转字段要求与按钮文案', () => {
  it('defectNeedsReason：解决/拒绝/关闭/重开/提交验证/解决必填；指派边可选；TESTING→IN_PROGRESS 必填', () => {
    for (const to of ['REJECTED', 'REOPEN', 'CLOSED', 'PENDING_VERIFICATION', 'RESOLVED']) {
      expect(defectNeedsReason('IN_PROGRESS', to)).toBe(true);
    }
    // TESTING → IN_PROGRESS（返回开发）必填
    expect(defectNeedsReason('TESTING', 'IN_PROGRESS')).toBe(true);
    // 指派边（→ASSIGNED / →NEW）原因可选
    expect(defectNeedsReason('NEW', 'ASSIGNED')).toBe(false);
    expect(defectNeedsReason('REJECTED', 'NEW')).toBe(false);
    // 其余 ASSIGNED/REOPEN → IN_PROGRESS 原因可选
    expect(defectNeedsReason('ASSIGNED', 'IN_PROGRESS')).toBe(false);
    expect(defectNeedsReason('REOPEN', 'IN_PROGRESS')).toBe(false);
    // →TESTING / →VERIFIED 只需人不需要原因
    expect(defectNeedsReason('IN_PROGRESS', 'TESTING')).toBe(false);
    expect(defectNeedsReason('RESOLVED', 'VERIFIED')).toBe(false);
  });

  it('defectNeedsActor：指派边→assignee，→TESTING→tester，→VERIFIED→verifier', () => {
    expect(defectNeedsActor('ASSIGNED')).toBe('assignee');
    expect(defectNeedsActor('NEW')).toBe('assignee');
    expect(defectNeedsActor('TESTING')).toBe('tester');
    expect(defectNeedsActor('VERIFIED')).toBe('verifier');
    for (const to of ['REJECTED', 'REOPEN', 'CLOSED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'RESOLVED']) {
      expect(defectNeedsActor(to)).toBeNull();
    }
  });

  it('defectTransitionLabel：分配/拒绝/开始处理/重新处理/提交验证/开始测试/解决/关闭/验证/重新打开/重新新建', () => {
    const fallback = (status: string) => `标签:${status}`;
    expect(defectTransitionLabel('NEW', 'ASSIGNED', fallback)).toBe('分配');
    expect(defectTransitionLabel('NEW', 'REJECTED', fallback)).toBe('拒绝');
    expect(defectTransitionLabel('ASSIGNED', 'IN_PROGRESS', fallback)).toBe('开始处理');
    expect(defectTransitionLabel('TESTING', 'IN_PROGRESS', fallback)).toBe('重新处理');
    expect(defectTransitionLabel('REOPEN', 'IN_PROGRESS', fallback)).toBe('重新处理');
    expect(defectTransitionLabel('IN_PROGRESS', 'PENDING_VERIFICATION', fallback)).toBe('提交验证');
    expect(defectTransitionLabel('IN_PROGRESS', 'TESTING', fallback)).toBe('开始测试');
    expect(defectTransitionLabel('PENDING_VERIFICATION', 'RESOLVED', fallback)).toBe('解决');
    expect(defectTransitionLabel('RESOLVED', 'CLOSED', fallback)).toBe('关闭');
    expect(defectTransitionLabel('RESOLVED', 'VERIFIED', fallback)).toBe('验证');
    expect(defectTransitionLabel('RESOLVED', 'REOPEN', fallback)).toBe('重新打开');
    expect(defectTransitionLabel('REJECTED', 'NEW', fallback)).toBe('重新新建');
  });
});

describe('缺陷变更 API 契约', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('updateDefect 走 POST /defect/v1/updateDefect，载荷原样透传（严重度/状态/指派不在此入口）', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    const result = await defectApi.updateDefect({
      id: 9,
      title: '登录页崩溃',
      priority: 'HIGH',
      reporterId: 3,
    });
    expect(result).toBe('ok');
    expect(postSpy).toHaveBeenCalledWith('/defect/v1/updateDefect', {
      id: 9,
      title: '登录页崩溃',
      priority: 'HIGH',
      reporterId: 3,
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('updateStatus 走 POST /defect/v1/updateStatus，载荷按 { id, status, …context } 透传', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue('ok');
    await defectApi.updateStatus({
      id: 9,
      status: 'ASSIGNED',
      assigneeId: 4,
      reason: '指派给前端组',
    });
    expect(postSpy).toHaveBeenCalledWith('/defect/v1/updateStatus', {
      id: 9,
      status: 'ASSIGNED',
      assigneeId: 4,
      reason: '指派给前端组',
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('changeSeverity 走 POST /defect/v1/{defectId}/severity，reason 客户端先 trim', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      defectId: 9,
      previousSeverity: 'MAJOR',
      currentSeverity: 'CRITICAL',
    });
    const result = await defectApi.changeSeverity(9, {
      expectedSeverity: 'MAJOR',
      targetSeverity: 'CRITICAL',
      reason: '  影响支付主流程  ',
    });
    expect(result).toEqual({
      defectId: 9,
      previousSeverity: 'MAJOR',
      currentSeverity: 'CRITICAL',
    });
    expect(postSpy).toHaveBeenCalledWith('/defect/v1/9/severity', {
      expectedSeverity: 'MAJOR',
      targetSeverity: 'CRITICAL',
      reason: '影响支付主流程',
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useDefectDetail 门控', () => {
  it('queryKey 形状为 [hc, defect, detail, id]', () => {
    expect(queryKeys.defect.detail(9)).toEqual(['hc', 'defect', 'detail', 9]);
  });

  it('id 无效时 disabled，不发起请求', () => {
    const getSpy = vi.spyOn(api, 'get');
    const client = createQueryClient();
    for (const badId of [null, undefined, 0, -1, Number.NaN]) {
      const Probe = () => {
        useDefectDetail(badId);
        return null;
      };
      renderToString(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    }
    expect(getSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });
});

describe('编辑载荷组装（buildDefectUpdatePayload）', () => {
  const baseForm = {
    title: '  登录页崩溃  ',
    description: '步骤略',
    defectType: '功能',
    priority: 'HIGH',
    reporterId: '3',
    foundDate: '2026-10-04T10:00:00',
    estimatedFixDate: '',
    reproductionSteps: '',
    expectedResult: '',
    actualResult: '',
    environment: '',
    tags: '',
  };

  it('标题 trim；空文本 → null（后端 null-skip = 保留原值）', () => {
    const payload = buildDefectUpdatePayload(9, baseForm);
    expect(payload).toEqual({
      id: 9,
      title: '登录页崩溃',
      description: '步骤略',
      defectType: '功能',
      priority: 'HIGH',
      reporterId: 3,
      foundDate: '2026-10-04T10:00:00',
      estimatedFixDate: null,
      reproductionSteps: null,
      expectedResult: null,
      actualResult: null,
      environment: null,
      tags: null,
    });
  });

  it('reporterId 留空 → null（保留原值，不清空）；非法输入由调用方先拦截，此处透传解析结果', () => {
    expect(buildDefectUpdatePayload(9, { ...baseForm, reporterId: '' }).reporterId).toBeNull();
    expect(buildDefectUpdatePayload(9, { ...baseForm, reporterId: '   ' }).reporterId).toBeNull();
    // parseOptionalPositiveInt 语义（与 task-create 共用）：纯数字即接受
    expect(buildDefectUpdatePayload(9, { ...baseForm, reporterId: '007' }).reporterId).toBe(7);
  });

  it('attachments 刻意省略：不读不写，避免覆盖并发附件变更', () => {
    const payload = buildDefectUpdatePayload(9, baseForm);
    expect('attachments' in payload).toBe(false);
  });

  it('editFormFromDefect 不回填 attachments：编辑表单不持有该字段', () => {
    const form = editFormFromDefect({
      id: 9,
      title: 't',
      attachments: 'a.pdf',
    } as never);
    expect('attachments' in form).toBe(false);
    expect(form.title).toBe('t');
  });
});

describe('严重度 CAS 失败路径（buildChangeDefectSeverityOptions）', () => {
  it('onError 失效缺陷详情查询：冲突后回取最新严重度，页面内可重试', () => {
    const client = createQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const options = buildChangeDefectSeverityOptions(client);
    options.onError(new Error('冲突'), {
      defectId: 9,
      data: { expectedSeverity: 'MAJOR', targetSeverity: 'CRITICAL', reason: 'x' },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.defect.detail(9),
    });
    invalidateSpy.mockRestore();
  });

  it('onSuccess 仍走缺陷域 + 需求域失效', () => {
    const client = createQueryClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const options = buildChangeDefectSeverityOptions(client);
    options.onSuccess();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.defect.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.requirement.all });
    invalidateSpy.mockRestore();
  });
});
