// @vitest-environment jsdom
/**
 * P2 执行工作台交互测试（codex r11 P2-2：r10-12 未闭合——testrun-workspace.test.tsx
 * 只有纯函数/API mock 与一处 SSR 冒烟，无工作台/弹窗挂载与交互断言）。
 *
 * 本文件挂载 TestRunDetailLive（执行工作台）与四个弹窗，覆盖关键路径交互：
 * - 工作台挂载：轮信息、用例卡片、冻结快照（r10 P2-4）、attempt 操作按钮、轮状态按钮
 * - 完成执行弹窗：打开、校验拦截、提交路径
 * - r11-1 回归：结果切换清空隐藏的执行备注（值 + FieldError）
 * - 重试 / 缺陷闭环 / 取消轮弹窗：打开与提交路径
 * - 轮状态操作（启动 / 完成确认）、逐用例操作（开始执行）
 * - dirty 退出确认（是否放弃修改？）
 * - pending 防重复提交
 * - 刷新失败保留草稿（lastGood：keyed dialogs 不 remount，r10 P2-1）
 *
 * 运行：pnpm vitest run src/lib/__tests__/testrun-workspace-interactions.test.tsx
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
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { api } from '../api/client';
import { queryKeys } from '../query/keys';
import { useAuthStore } from '../api/auth-store';
import type {
  TestExecutionResponse,
  TestRunCaseDetailResponse,
  TestRunDetailResponse,
  TestRunResponse,
} from '../api/testRun-types';
import type { TestExecutionResult } from '../api/testRun-types';
import { TestRunDetailLive } from '../../components/pm/testrun-detail-live';

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

function attempt(
  overrides: Partial<TestExecutionResponse>,
): TestExecutionResponse {
  return {
    id: 101,
    runCaseId: 201,
    attemptNo: 1,
    status: 'NOT_STARTED',
    result: null,
    actualResult: null,
    failureMessage: null,
    executionNotes: null,
    evidenceScreenshotAttached: null,
    evidenceLogAttached: null,
    executedBy: null,
    completedBy: null,
    actualStartTime: null,
    actualEndTime: null,
    duration: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function snapshot(title: string) {
  return {
    caseNumber: 'TC-001',
    title,
    description: null,
    testType: null,
    priority: null,
    preconditions: null,
    testSteps: '1. 打开登录页\n2. 输入账号密码',
    expectedResult: '登录成功并进入首页',
    testData: null,
    environmentRequirements: null,
    estimatedDuration: null,
    tags: null,
  };
}

function runCase(
  runCaseId: number,
  title: string,
  latest: TestExecutionResponse,
  extra: Partial<TestRunCaseDetailResponse> = {},
): TestRunCaseDetailResponse {
  return {
    runCaseId,
    testCaseId: runCaseId + 1000,
    displayOrder: runCaseId - 200,
    snapshot: snapshot(title),
    latestAttempt: latest,
    attempts: [latest],
    defects: [],
    ...extra,
  };
}

function baseRun(overrides: Partial<TestRunResponse> = {}): TestRunResponse {
  return {
    id: 5,
    projectId: 7,
    runName: '回归轮',
    runType: 'FULL_REGRESSION',
    status: 'RUNNING',
    environment: 'staging',
    sourceRunId: null,
    versionId: null,
    scopeFingerprint: null,
    requiredCaseCount: 3,
    startedBy: 9,
    startedAt: '2026-10-04T10:00:00',
    completedBy: null,
    completedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: '2026-10-04T09:00:00',
    updatedAt: '2026-10-04T10:00:00',
    ...overrides,
  };
}

/** RUNNING 轮：用例 201 未开始 / 202 执行中（本人） / 203 失败（他人执行） */
function runningDetail(): TestRunDetailResponse {
  return {
    run: baseRun(),
    cases: [
      runCase(
        201,
        '登录用例',
        attempt({ id: 101, runCaseId: 201, status: 'NOT_STARTED' }),
      ),
      runCase(
        202,
        '支付用例',
        attempt({
          id: 102,
          runCaseId: 202,
          status: 'RUNNING',
          executedBy: 9,
        }),
      ),
      runCase(
        203,
        '搜索用例',
        attempt({
          id: 103,
          runCaseId: 203,
          attemptNo: 2,
          status: 'COMPLETED',
          result: 'FAILED',
          failureMessage: '断言失败',
          executedBy: 8,
        }),
        {
          attempts: [
            attempt({
              id: 100,
              runCaseId: 203,
              attemptNo: 1,
              status: 'COMPLETED',
              result: 'PASSED',
              executedBy: 8,
            }),
            attempt({
              id: 103,
              runCaseId: 203,
              attemptNo: 2,
              status: 'COMPLETED',
              result: 'FAILED',
              failureMessage: '断言失败',
              executedBy: 8,
            }),
          ],
        },
      ),
    ],
  };
}

/** RUNNING 轮且全部 attempt 已完成 → 「完成测试轮」可点 */
function allCompletedDetail(): TestRunDetailResponse {
  const done = (id: number, runCaseId: number, result: TestExecutionResult) =>
    attempt({
      id,
      runCaseId,
      status: 'COMPLETED',
      result,
      executedBy: 9,
    });
  return {
    run: baseRun(),
    cases: [
      runCase(201, '登录用例', done(101, 201, 'PASSED')),
      runCase(202, '支付用例', done(102, 202, 'FAILED')),
    ],
  };
}

/* ---------- API mock（按 URL 路由；记录调用供断言） ---------- */

interface RecordedCall {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
}

function installApiMocks(detail: () => TestRunDetailResponse) {
  const calls: RecordedCall[] = [];
  const getSpy = vi
    .spyOn(api, 'get')
    .mockImplementation(async (path: string) => {
      calls.push({ method: 'GET', url: path });
      if (path === '/testRun/v1/5') return detail() as never;
      throw new Error(`unexpected GET ${path}`);
    });
  const postSpy = vi
    .spyOn(api, 'post')
    .mockImplementation(async (path: string, body?: unknown) => {
      calls.push({ method: 'POST', url: path, body });
      if (path === '/project/v1/findByPage') {
        return {
          list: [{ id: 7, projectKey: 'demo' }],
          total: 1,
          pageNumber: 1,
          pageSize: 100,
        } as never;
      }
      if (path === '/testRun/v1/5/start')
        return baseRun({ status: 'RUNNING' }) as never;
      if (path === '/testRun/v1/5/complete')
        return baseRun({ status: 'COMPLETED' }) as never;
      if (path === '/testRun/v1/5/cancel')
        return baseRun({ status: 'CANCELLED' }) as never;
      if (path === '/testExecution/v1/101/start')
        return attempt({ id: 101, runCaseId: 201, status: 'RUNNING' }) as never;
      if (path === '/testExecution/v1/102/complete') {
        const data = body as { result: TestExecutionResult };
        return attempt({
          id: 102,
          runCaseId: 202,
          status: 'COMPLETED',
          result: data.result,
          executedBy: 9,
        }) as never;
      }
      if (path === '/testExecution/v1/103/retry')
        return attempt({
          id: 104,
          runCaseId: 203,
          attemptNo: 3,
          status: 'NOT_STARTED',
          executedBy: 9,
        }) as never;
      if (path === '/testExecution/v1/103/defects')
        return { operation: 'CREATED', defect: { id: 9001 } } as never;
      throw new Error(`unexpected POST ${path}`);
    });
  return { calls, getSpy, postSpy };
}

function posted(calls: RecordedCall[], url: string): RecordedCall[] {
  return calls.filter((c) => c.method === 'POST' && c.url === url);
}

/* ---------- 渲染辅助（QueryClient + 最小内存路由，供 useBlocker/useNavigate） ---------- */

async function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const rootRoute = createRootRoute({
    component: () => <TestRunDetailLive testRunId={5} projectKey="demo" />,
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
  // 等工作台主内容挂载（详情 + 项目归属两路查询落定）
  await utils.findByRole('heading', { name: /测试轮 #5/ });
  return { ...utils, queryClient, router };
}

/**
 * 在执行结果 Autocomplete 中选择一项。
 * HeroUI Autocomplete 的触发器是 button（可访问名含 placeholder 与 aria-label，
 * 如"请选择 执行结果（必填）"）；点开后选项以 listbox option 形式出现在 popover 中。
 */
async function chooseExecutionResult(label: string) {
  // React Aria 的 press 交互依赖完整的指针事件序列，fireEvent.click 不足以
  // 触发 ListBox 选项选中，改用 user-event
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /执行结果/ }));
  const option = await screen.findByRole('option', { name: label });
  await user.click(option);
  // 等待选中态回写到触发器（按钮文案变为所选项）
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: new RegExp(label) }),
    ).toBeInTheDocument(),
  );
}

/** 打开执行 #102（RUNNING，本人执行 → 覆盖原因隐藏）的完成执行弹窗 */
async function openCompleteDialog() {
  fireEvent.click(screen.getByRole('button', { name: '完成执行 102' }));
  await screen.findByRole('heading', { name: '完成执行 #102' });
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

describe('执行工作台挂载', () => {
  it('渲染轮信息、用例卡片、冻结快照与 attempt 操作按钮', async () => {
    installApiMocks(runningDetail);
    await renderWorkspace();

    // 轮标题与基本信息
    expect(
      screen.getByRole('heading', { name: /测试轮 #5/ }),
    ).toBeInTheDocument();
    // 用例卡片
    expect(screen.getByText('登录用例')).toBeInTheDocument();
    expect(screen.getByText('支付用例')).toBeInTheDocument();
    expect(screen.getByText('搜索用例')).toBeInTheDocument();
    // 冻结快照可查看（r10 P2-4）：三个用例卡片各一处
    expect(
      screen.getAllByText('查看冻结快照（测试步骤 / 预期结果）'),
    ).toHaveLength(3);
    // 逐用例操作：NOT_STARTED → 开始；RUNNING → 完成；
    // 失败 attempt → 缺陷闭环；最新失败 attempt 且轮 RUNNING → 重试
    expect(
      screen.getByRole('button', { name: '开始执行 101' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '完成执行 102' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '执行 103 缺陷闭环' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '重试执行 103' }),
    ).toBeInTheDocument();
  });

  it('RUNNING 轮且有用例未完成 → 「完成测试轮」禁用并提示原因', async () => {
    installApiMocks(runningDetail);
    await renderWorkspace();

    const completeRunBtn = screen.getByRole('button', { name: '完成测试轮' });
    expect((completeRunBtn as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('全部用例的最新 attempt 完成后才可完成测试轮'),
    ).toBeInTheDocument();
  });

  it('RUNNING 轮且全部 attempt 已完成 → 「完成测试轮」可点并走确认提交', async () => {
    const { calls } = installApiMocks(allCompletedDetail);
    await renderWorkspace();

    const completeRunBtn = screen.getByRole('button', { name: '完成测试轮' });
    expect((completeRunBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(completeRunBtn);
    await screen.findByRole('heading', { name: '完成测试轮 #5' });
    fireEvent.click(screen.getByRole('button', { name: '确认完成' }));
    await waitFor(() =>
      expect(posted(calls, '/testRun/v1/5/complete')).toHaveLength(1),
    );
  });

  it('CREATED 轮 → 「启动测试轮」提交 start', async () => {
    const { calls } = installApiMocks(() => ({
      ...runningDetail(),
      run: baseRun({ status: 'CREATED' }),
    }));
    await renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '启动测试轮' }));
    await waitFor(() =>
      expect(posted(calls, '/testRun/v1/5/start')).toHaveLength(1),
    );
  });

  it('逐用例操作：NOT_STARTED attempt「开始执行」提交 start', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '开始执行 101' }));
    await waitFor(() =>
      expect(posted(calls, '/testExecution/v1/101/start')).toHaveLength(1),
    );
  });
});

describe('完成执行弹窗：打开、校验与提交', () => {
  it('空提交 → result 必填错误挂在字段下，请求不发出', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();
    await openCompleteDialog();

    fireEvent.click(screen.getByRole('button', { name: '完成执行' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('执行结果为必填项');
    expect(posted(calls, '/testExecution/v1/102/complete')).toHaveLength(0);
  });

  it('选失败 + 填失败说明 → 提交携带 result/failureMessage 并关闭弹窗', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();
    await openCompleteDialog();

    await chooseExecutionResult('失败');
    fireEvent.change(screen.getByLabelText('失败说明'), {
      target: { value: '登录接口 500' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成执行' }));

    await waitFor(() =>
      expect(posted(calls, '/testExecution/v1/102/complete')).toHaveLength(1),
    );
    const payload = posted(calls, '/testExecution/v1/102/complete')[0]
      .body as Record<string, unknown>;
    expect(payload.result).toBe('FAILED');
    expect(payload.failureMessage).toBe('登录接口 500');
    // 成功后弹窗关闭（markClean + doClose）
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '完成执行 #102' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('r11-1 回归：失败备注超 65535 字节 → 切到通过后隐藏字段的值与错误被同步清空，提交不再被拦截', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();
    await openCompleteDialog();

    // FAILED 下在执行备注填入超限内容（65536 UTF-8 字节）
    await chooseExecutionResult('失败');
    fireEvent.change(screen.getByLabelText('失败说明'), {
      target: { value: '根因定位中' },
    });
    fireEvent.change(screen.getByLabelText('执行备注'), {
      target: { value: 'x'.repeat(65536) },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成执行' }));
    // 字节超限错误挂在备注字段下，提交被拦截
    const notesError = await screen.findByText(/执行备注内容过大/);
    expect(notesError).toBeInTheDocument();
    expect(posted(calls, '/testExecution/v1/102/complete')).toHaveLength(0);

    // 切到通过：备注输入与 FieldError 隐藏（r11-1 修复：同步清空值+错误）
    await chooseExecutionResult('通过');
    expect(screen.queryByLabelText('执行备注')).not.toBeInTheDocument();
    expect(screen.queryByText(/执行备注内容过大/)).not.toBeInTheDocument();

    // 提交不再被看不见的错误拦截；载荷中不含残留 executionNotes
    fireEvent.click(screen.getByRole('button', { name: '完成执行' }));
    await waitFor(() =>
      expect(posted(calls, '/testExecution/v1/102/complete')).toHaveLength(1),
    );
    const payload = posted(calls, '/testExecution/v1/102/complete')[0]
      .body as Record<string, unknown>;
    expect(payload.result).toBe('PASSED');
    expect(payload.executionNotes ?? '').toBe('');
  });

  it('pending 中提交按钮禁用并显示「提交中…」，重复点击只发出一次请求', async () => {
    const { calls, postSpy } = installApiMocks(runningDetail);
    // complete 接口永不 resolve，制造 pending 态
    postSpy.mockImplementation(async (path: string, body?: unknown) => {
      calls.push({ method: 'POST', url: path, body });
      if (path === '/project/v1/findByPage') {
        return {
          list: [{ id: 7, projectKey: 'demo' }],
          total: 1,
          pageNumber: 1,
          pageSize: 100,
        } as never;
      }
      if (path === '/testExecution/v1/102/complete')
        return new Promise(() => {}) as never;
      throw new Error(`unexpected POST ${path}`);
    });
    await renderWorkspace();
    await openCompleteDialog();

    await chooseExecutionResult('通过');
    const submitBtn = screen.getByRole('button', {
      name: '完成执行',
    }) as HTMLButtonElement;
    fireEvent.click(submitBtn);
    // pending 态：按钮禁用 + 文案切换
    await waitFor(() => expect(submitBtn.disabled).toBe(true));
    expect(submitBtn).toHaveTextContent('提交中…');
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    expect(posted(calls, '/testExecution/v1/102/complete')).toHaveLength(1);
  });
});

describe('重试 / 缺陷闭环 / 取消轮弹窗：打开与提交', () => {
  it('重试执行弹窗：填原因 → 提交 retry 并关闭', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '重试执行 103' }));
    await screen.findByRole('heading', { name: '重试执行 #103' });
    fireEvent.change(screen.getByLabelText('原因'), {
      target: { value: '环境抖动，重试一次' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认重试' }));

    await waitFor(() =>
      expect(posted(calls, '/testExecution/v1/103/retry')).toHaveLength(1),
    );
    const payload = posted(calls, '/testExecution/v1/103/retry')[0].body as {
      reason: string;
    };
    expect(payload.reason).toBe('环境抖动，重试一次');
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '重试执行 #103' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('重试弹窗空原因 → 字段级错误，请求不发出', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '重试执行 103' }));
    await screen.findByRole('heading', { name: '重试执行 #103' });
    fireEvent.click(screen.getByRole('button', { name: '确认重试' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(posted(calls, '/testExecution/v1/103/retry')).toHaveLength(0);
  });

  it('缺陷闭环弹窗：填标题 → 创建缺陷提交并关闭', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '执行 103 缺陷闭环' }));
    await screen.findByRole('heading', { name: /执行缺陷闭环/ });
    fireEvent.change(screen.getByLabelText('缺陷标题'), {
      target: { value: '搜索无结果页崩溃' },
    });
    // 页脚提交按钮（与「创建缺陷」模式切换按钮同名，取最后一个）
    const dialog = screen.getByRole('dialog');
    const createButtons = within(dialog).getAllByRole('button', {
      name: '创建缺陷',
    });
    fireEvent.click(createButtons[createButtons.length - 1]);

    await waitFor(() =>
      expect(posted(calls, '/testExecution/v1/103/defects')).toHaveLength(1),
    );
    const payload = posted(calls, '/testExecution/v1/103/defects')[0]
      .body as Record<string, unknown>;
    expect(payload.title).toBe('搜索无结果页崩溃');
    expect(payload.severity).toBe('MAJOR');
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /执行缺陷闭环/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it('取消测试轮弹窗：填原因 → 提交 cancel 并关闭', async () => {
    const { calls } = installApiMocks(runningDetail);
    await renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '取消测试轮' }));
    await screen.findByRole('heading', { name: '取消测试轮 #5' });
    fireEvent.change(screen.getByLabelText('原因'), {
      target: { value: '需求变更，本轮作废' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认取消' }));

    await waitFor(() =>
      expect(posted(calls, '/testRun/v1/5/cancel')).toHaveLength(1),
    );
    const payload = posted(calls, '/testRun/v1/5/cancel')[0].body as {
      reason: string;
    };
    expect(payload.reason).toBe('需求变更，本轮作废');
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '取消测试轮 #5' }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('dirty 退出确认', () => {
  it('脏表单点取消 → 弹出「是否放弃修改？」，确认后关闭且草稿清空', async () => {
    installApiMocks(runningDetail);
    await renderWorkspace();
    await openCompleteDialog();

    fireEvent.change(screen.getByLabelText('实际结果'), {
      target: { value: '未保存的草稿' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await screen.findByRole('heading', { name: '是否放弃修改？' });
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '完成执行 #102' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('脏表单点取消 → 「继续编辑」后弹窗保持打开、草稿保留', async () => {
    installApiMocks(runningDetail);
    await renderWorkspace();
    await openCompleteDialog();

    fireEvent.change(screen.getByLabelText('实际结果'), {
      target: { value: '未保存的草稿' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await screen.findByRole('heading', { name: '是否放弃修改？' });
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '是否放弃修改？' }),
      ).not.toBeInTheDocument(),
    );
    // 完成弹窗仍在，草稿未丢
    expect(
      screen.getByRole('heading', { name: '完成执行 #102' }),
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText('实际结果') as HTMLTextAreaElement).value,
    ).toBe('未保存的草稿');
  });

  it('干净表单点取消 → 直接关闭，不弹确认', async () => {
    installApiMocks(runningDetail);
    await renderWorkspace();
    await openCompleteDialog();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: '完成执行 #102' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: '是否放弃修改？' }),
    ).not.toBeInTheDocument();
  });
});

describe('刷新失败保留草稿（lastGood，r10 P2-1）', () => {
  it('后台重取失败切错误分支时，已打开的完成弹窗不 remount、草稿保留', async () => {
    let failDetail = false;
    const { getSpy } = installApiMocks(runningDetail);
    getSpy.mockImplementation(async (path: string) => {
      if (path === '/testRun/v1/5') {
        if (failDetail) throw new Error('network down');
        return runningDetail() as never;
      }
      throw new Error(`unexpected GET ${path}`);
    });
    const { queryClient } = await renderWorkspace();
    await openCompleteDialog();

    fireEvent.change(screen.getByLabelText('实际结果'), {
      target: { value: '刷新前填写的草稿' },
    });

    // 模拟后台重取失败（isError=true 但有旧数据 → 错误分支）
    failDetail = true;
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.testRun.detail(5),
      });
    });

    // 错误分支渲染，但 keyed dialogs 未被卸载：弹窗仍在、草稿仍在
    expect(await screen.findByText(/测试轮加载失败/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '完成执行 #102' }),
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText('实际结果') as HTMLTextAreaElement).value,
    ).toBe('刷新前填写的草稿');
  });
});
