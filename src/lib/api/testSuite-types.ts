/**
 * P2 测试套件契约类型。
 *
 * 忠实映射 hc-project-manage 后端 TestSuiteController（testSuite/v1）。
 * ⚠️ 接线告警（来自 P2 scoping）：老前端（frontend/src/api/testSuite.ts）走的是
 * 遗留路径 `/test-suite/*`（listTestSuitesByProject、getTestSuiteStatistics、
 * copyTestSuite、batchDeleteTestSuites 等），且后端 `testSuite/v1` 没有这些端点的
 * 对应实现（复制/统计无端点）。此处只建模 `testSuite/v1` 的真实端点：
 * createTestSuite/updateTestSuite/valid/{id}/invalid/{id}/findById/{id}/findByPage；
 * copy/statistic 不建模。
 * - status 为状态枚举名字符串，八态：DRAFT（草稿）/ACTIVE（生效）/
 *   IN_PROGRESS（进行中）/EXECUTING（执行中）/PAUSED（已暂停）/
 *   COMPLETED（已完成）/DEPRECATED（已废弃）/CLOSED（已关闭）
 *   （TestSuiteStatusEnum）
 * - POST 语义：createTestSuite/updateTestSuite/valid/{id}/invalid/{id}/
 *   findByPage 全部为 POST；findById 为 GET
 */

/** 测试套件状态（八态） */
export const TEST_SUITE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'IN_PROGRESS',
  'EXECUTING',
  'PAUSED',
  'COMPLETED',
  'DEPRECATED',
  'CLOSED',
] as const;
export type TestSuiteStatus = (typeof TEST_SUITE_STATUSES)[number];

/** 测试套件状态中文文案（忠实后端 TestSuiteStatusEnum name） */
export const TEST_SUITE_STATUS_LABELS: Record<TestSuiteStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '生效',
  IN_PROGRESS: '进行中',
  EXECUTING: '执行中',
  PAUSED: '已暂停',
  COMPLETED: '已完成',
  DEPRECATED: '已废弃',
  CLOSED: '已关闭',
};

/** 新建套件载荷（忠实于后端 TestSuiteCreateRequest） */
export interface TestSuiteCreatePayload {
  suiteName: string;
  projectId: number;
  description?: string;
  suiteType?: string;
  status?: TestSuiteStatus;
  priority?: string;
  estimatedTime?: number;
  actualTime?: number;
  passRate?: number;
  totalCases?: number;
  passedCases?: number;
  failedCases?: number;
  skippedCases?: number;
}

/** 更新套件载荷（忠实于后端 TestSuiteUpdateRequest；id 必传） */
export interface TestSuiteUpdatePayload extends TestSuiteCreatePayload {
  id: number;
}

/** 测试套件（忠实于后端 TestSuiteResponse） */
export interface TestSuiteResponse extends TestSuiteCreatePayload {
  id: number;
  createdBy?: number;
  updatedBy?: number;
}

/** 套件查询条件（忠实于后端 TestSuiteQueryRequest） */
export interface TestSuiteQueryRequest {
  suiteName?: string;
  projectId?: number;
  suiteType?: string;
  status?: TestSuiteStatus;
}
