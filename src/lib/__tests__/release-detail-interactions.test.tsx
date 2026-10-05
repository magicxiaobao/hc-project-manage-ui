// @vitest-environment jsdom
/**
 * P2 发布详情交互回归测试（codex r25 双评审 4 条真问题修复验证）。
 *
 * 挂载 ReleaseDetailLive（发布详情全生命周期）覆盖：
 * - r25-1 回归：后台重取失败切错误分支时，已打开的豁免弹窗不 remount、
 *   草稿保留（keyed <Fragment key="release-dialogs"> + 各分支统一 <div> 根）
 * - r25-2 回归：错项目上下文直接返回 EmptyHint，不展示它项目详情
 *   （version-detail-live:153-162 先例）
 * - r25-3 回归：项目归属解析失败 → 顶部 projectContextNotice + 重试入口
 * - r25-4 回归：全部非 DIRECT 门禁已通过 → 顶部"豁免门禁"入口禁用
 *
 * 运行：pnpm vitest run src/lib/__tests__/release-detail-interactions.test.tsx
 * （已接入 pnpm run test:lib → pnpm test）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { api } from '../api/client';
import { queryKeys } from '../query/keys';
import { useAuthStore } from '../api/auth-store';
import type {
  ReleaseDetailResponse,
  ReleaseGateResultResponse,
  ReleaseResponse,
} from '../api/release-types';
import { ReleaseDetailLive } from '../../components/pm/release-detail-live';

/* ---------- jsdom 环境补齐（HeroUI/React Aria 在真实浏览器外需要的 API） ---------- */

function installDomStubs() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const w = window as unknown as Record<string, unknown>;
  w.ResizeObserver ??= NoopObserver;
  w.IntersectionObserver ??= NoopObserver;
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
}
installDomStubs();

/* ---------- fixtures ---------- */

function baseRelease(overrides: Partial<ReleaseResponse> = {}): ReleaseResponse {
  return {
    id: 5,
    projectId: 7,
    versionId: 11,
    environmentId: 3,
    releaseType: 'STANDARD',
    rollbackOfReleaseId: null,
    copySourceReleaseId: null,
    sequenceNo: 1,
    status: 'DRAFT',
    releaseNotes: '首个发布',
    changelog: null,
    rollbackPlan: null,
    knownIssues: null,
    forceUpdate: false,
    compatibility: null,
    dependencies: null,
    environmentCategory: 'TESTING',
    environmentApprovalRequired: false,
    draftOwnerId: 9,
    proposerId: 9,
    testEvidenceState: null,
    evidenceRunId: null,
    scopeFingerprint: null,
    requiredCaseCount: null,
    executedCaseCount: null,
    passedCaseCount: null,
    failedCaseCount: null,
    blockedCaseCount: null,
    skippedCaseCount: null,
    snapshotCalculatedAt: null,
    submittedAt: null,
    approvedAt: null,
    releasedAt: null,
    failedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function passedGate(gateType: ReleaseGateResultResponse['gateType']): ReleaseGateResultResponse {
  return {
    gateType,
    passed: true,
    waived: false,
    waiverActorId: null,
    waiverReason: null,
    waivedAt: null,
  };
}

function baseDetail(overrides: Partial<ReleaseDetailResponse> = {}): ReleaseDetailResponse {
  return {
    release: baseRelease(),
    scopeNodes: [],
    scopeRelations: [],
    testAttempts: [],
    defects: [],
    gateResults: [],
    waivers: [],
    approval: null,
    artifact: null,
    ...overrides,
  };
}

/* ---------- API mock（按 URL 路由；记录调用供断言） ---------- */

interface RecordedCall {
  method: 'GET' | 'POST';
  url: string;
}

interface MockOpts {
  /** 详情 GET 是否抛错（模拟后台重取失败） */
  failDetail?: () => boolean;
  /** 项目归属解析结果：number=解析成功；'error'=抛错 */
  projectResolution?: number | 'error';
  detail?: () => ReleaseDetailResponse;
}

function installApiMocks(opts: MockOpts = {}) {
  const calls: RecordedCall[] = [];
  const failDetail = opts.failDetail ?? (() => false);
  const projectResolution = opts.projectResolution ?? 7;
  const detail = opts.detail ?? (() => baseDetail());
  const getSpy = vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
    calls.push({ method: 'GET', url: path });
    if (path === '/release/v1/findById/5') {
      if (failDetail()) throw new Error('network down');
      return detail() as never;
    }
    throw new Error(`unexpected GET ${path}`);
  });
  const postSpy = vi.spyOn(api, 'post').mockImplementation(async (path: string) => {
    calls.push({ method: 'POST', url: path });
    if (path === '/project/v1/findByPage') {
      if (projectResolution === 'error') throw new Error('project lookup down');
      return {
        list: [{ id: projectResolution, projectKey: 'demo' }],
        total: 1,
        pageNumber: 1,
        pageSize: 100,
      } as never;
    }
    throw new Error(`unexpected POST ${path}`);
  });
  return { calls, getSpy, postSpy };
}

function posted(calls: RecordedCall[], url: string): RecordedCall[] {
  return calls.filter((c) => c.method === 'POST' && c.url === url);
}

/* ---------- 渲染辅助（QueryClient + 最小内存路由，供 useBlocker/useNavigate） ---------- */

async function renderDetail(ready?: { heading?: RegExp; text?: RegExp }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const rootRoute = createRootRoute({
    component: () => <ReleaseDetailLive releaseId={5} projectKey="demo" />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // 等详情主内容挂载（详情 + 项目归属两路查询落定）；错项目场景等待 EmptyHint
  if (ready?.text) {
    await utils.findByText(ready.text);
  } else {
    await utils.findByRole('heading', { name: ready?.heading ?? '发布 #5' });
  }
  return { ...utils, queryClient, router };
}

beforeEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({
    user: {
      userId: '9',
      userName: 'tester',
      cnName: null,
      extraInfo: {},
      roles: [],
      authorities: [],
    },
    token: 'test-token',
    isAuthenticated: true,
  });
});

afterEach(() => {
  // 本仓库 vitest 未开 globals，testing-library 的自动 cleanup 不生效，
  // 必须显式卸载，否则多测试的 DOM/portal 会互相干扰
  cleanup();
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
});

describe('r25-1 回归：刷新失败不卸载弹窗草稿', () => {
  it('后台重取失败切错误分支时，已打开的豁免弹窗不 remount、草稿保留', async () => {
    let failDetail = false;
    installApiMocks({ failDetail: () => failDetail });
    const { queryClient } = await renderDetail();

    // 打开豁免弹窗（DRAFT + 归属校验通过 → 顶部入口可用）
    fireEvent.click(screen.getByRole('button', { name: '豁免门禁' }));
    await screen.findByRole('heading', { name: '豁免门禁' });

    fireEvent.change(screen.getByLabelText('豁免原因'), {
      target: { value: '刷新前填写的豁免草稿' },
    });

    // 模拟后台重取失败（isError=true 但有旧数据 → 错误分支）
    failDetail = true;
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.release.detail(5),
      });
    });

    // 错误分支渲染，但 keyed dialogs 未被卸载：弹窗仍在、草稿仍在
    expect(await screen.findByText(/发布详情刷新失败/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '豁免门禁' }),
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText('豁免原因') as HTMLTextAreaElement).value,
    ).toBe('刷新前填写的豁免草稿');
  });
});

describe('r25-2 回归：错项目上下文不展示详情', () => {
  it('路由项目与记录 projectId 不符 → EmptyHint，不渲染详情内容', async () => {
    installApiMocks({ projectResolution: 8 });
    await renderDetail({ text: /发布 #5 不属于当前项目/ });

    await waitFor(() =>
      expect(screen.getByText(/发布 #5 不属于当前项目/)).toBeInTheDocument(),
    );
    // 详情主内容（标题栏）不应出现
    expect(
      screen.queryByRole('heading', { name: '发布 #5' }),
    ).not.toBeInTheDocument();
  });
});

describe('r25-3 回归：项目归属解析失败有提示与重试', () => {
  it('routeProjectQuery 失败 → 顶部挂禁用提示 + 重试入口', async () => {
    const { calls } = installApiMocks({ projectResolution: 'error' });
    await renderDetail();

    await waitFor(() =>
      expect(
        screen.getByText('当前无法确认归属，操作区已禁用'),
      ).toBeInTheDocument(),
    );
    const retryButton = screen.getByRole('button', {
      name: '重试确认项目归属',
    });
    expect(retryButton).toBeInTheDocument();

    // 写操作区隐藏（静默只读不再无声）
    expect(
      screen.queryByRole('button', { name: '编辑草稿' }),
    ).not.toBeInTheDocument();

    const before = posted(calls, '/project/v1/findByPage').length;
    fireEvent.click(retryButton);
    await waitFor(() =>
      expect(posted(calls, '/project/v1/findByPage').length).toBeGreaterThan(
        before,
      ),
    );
  });
});

describe('r25-4 回归：无可豁免门禁时顶部入口禁用', () => {
  it('全部非 DIRECT 门禁已通过 → 顶部"豁免门禁"按钮禁用', async () => {
    installApiMocks({
      detail: () =>
        baseDetail({
          gateResults: [
            passedGate('REQUIRED_CASES_PASSED'),
            passedGate('NO_BLOCKING_DEFECT'),
            passedGate('RELEASE_NOTES_COMPLETE'),
            passedGate('ROLLBACK_PLAN_COMPLETE'),
          ],
        }),
    });
    await renderDetail();

    expect(
      screen.getByRole('button', { name: '豁免门禁' }),
    ).toBeDisabled();
  });

  it('有未通过门禁时 → 顶部"豁免门禁"按钮可用', async () => {
    installApiMocks();
    await renderDetail();

    expect(
      screen.getByRole('button', { name: '豁免门禁' }),
    ).not.toBeDisabled();
  });
});
