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

/** 测试套件类型（老前端 TestSuiteTypeSelector 选项，前端常量；后端为 String 不校验） */
export const TEST_SUITE_TYPES = [
  '冒烟测试',
  '回归测试',
  '集成测试',
  '系统测试',
  '性能测试',
  '安全测试',
] as const;
export type TestSuiteType = (typeof TEST_SUITE_TYPES)[number];

/** 测试套件优先级（系统惯例：与缺陷/用例一致的三档中文；后端为 String 不校验） */
export const TEST_SUITE_PRIORITIES = ['高', '中', '低'] as const;
export type TestSuitePriority = (typeof TEST_SUITE_PRIORITIES)[number];

/** 新建套件载荷（忠实于后端 TestSuiteCreateRequest） */
export interface TestSuiteCreatePayload {
  suiteName: string;
  projectId: number;
  description?: string;
  suiteType?: TestSuiteType;
  status?: TestSuiteStatus;
  priority?: TestSuitePriority;
  estimatedTime?: number;
  actualTime?: number;
  passRate?: number;
  totalCases?: number;
  passedCases?: number;
  failedCases?: number;
  skippedCases?: number;
}

/**
 * 更新套件载荷（忠实于后端 TestSuiteUpdateRequest；id 必传）。
 * 字段级更新：除 id 外全可选。后端 BaseTestSuiteUpdater 只应用非空字段，
 * suiteName/projectId 均可省略（提供 projectId 时必须与存储一致）。
 */
export interface TestSuiteUpdatePayload
  extends Omit<TestSuiteCreatePayload, 'suiteName' | 'projectId'> {
  id: number;
  suiteName?: string;
  projectId?: number;
}

/**
 * 测试套件（忠实于后端 TestSuiteResponse + AbstractResponse）。
 * 独立定义：响应含 AbstractResponse 的 createdAt/updatedAt（秒级 Long），
 * 各标量字段可为 null（Jackson 透出 null），与 DefectResponse 建模惯例一致。
 */
export interface TestSuiteResponse {
  id: number;
  createdAt: number | null;
  updatedAt: number | null;
  suiteName: string;
  projectId: number;
  description: string | null;
  suiteType: TestSuiteType | null;
  status: TestSuiteStatus;
  priority: TestSuitePriority | null;
  estimatedTime: number | null;
  actualTime: number | null;
  passRate: number | null;
  totalCases: number | null;
  passedCases: number | null;
  failedCases: number | null;
  skippedCases: number | null;
  createdBy: number | null;
  updatedBy: number | null;
}

/**
 * 套件查询条件（忠实于后端 TestSuiteQueryRequest）。
 * projectId 必填：后端 TestSuiteServiceImpl.findByPage 显式校验
 * （"测试套件分页查询必须指定项目"，ParamSetIllegal）。
 */
export interface TestSuiteQueryRequest {
  suiteName?: string;
  projectId: number;
  suiteType?: TestSuiteType;
  status?: TestSuiteStatus;
}
