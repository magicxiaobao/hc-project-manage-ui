/**
 * P2 测试用例契约类型。
 *
 * 忠实映射 hc-project-manage 后端 TestCaseController（testCase/v1）与老前端
 * （frontend/src/api/testCase.ts、frontend/src/types/testCase.ts）：
 * - status 为状态枚举名字符串，四态：DRAFT（草稿）/ACTIVE（生效）/
 *   REVIEW（评审中）/ARCHIVED（已归档）（TestCaseStatusEnum）
 * - testType 为中文业务值：功能测试/性能测试/安全测试/兼容性测试/
 *   界面测试/回归测试/其他（前端常量，老前端 TestCaseForm 选项）
 * - priority 为三档中文：高/中/低（老前端约定）
 * - POST 语义：createTestCase/updateTestCase/valid/{id}/invalid/{id}/
 *   findByPage/deleteTestCase/{id}（软删，老前端称为 archiveTestCase）/
 *   duplicateTestCase/{id}/advancedSearch 全部为 POST；findById 为 GET
 * - findByPage 的 bean 必须带有效 projectId（后端 validatePageRequest 直接报业务码），
 *   分页参数必须为正整数
 * - 高级搜索 bean.projectIds 必填：后端 TestCaseProjectScopeResolver 为 fail-closed，
 *   项目集合为空时权限解析直接拒绝（advancedScope 返回空集合）
 * - batchDeleteTestCase（批量）与 advancedSearchExport（返回 JSON
 *   Result<List<TestCaseResponse>>，非 xlsx 文件）为 P2 明确排除项，不在此建模
 * - 写入侧（创建/更新）的 status 不允许 ARCHIVED：后端 TestCaseServiceImpl 显式拒绝
 *   （"不能以归档状态创建测试用例" / "归档测试用例必须使用专用归档入口"）
 * - lastExecutedAt 为 LocalDateTime，老前端收发格式为 'YYYY-MM-DDTHH:mm:ss' 字符串，
 *   此处类型化为 string
 */

/** 测试用例状态（四态） */
export const TEST_CASE_STATUSES = ['DRAFT', 'ACTIVE', 'REVIEW', 'ARCHIVED'] as const;
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number];

/** 测试用例类型（老前端业务值，中文） */
export const TEST_CASE_TYPES = [
  '功能测试',
  '性能测试',
  '安全测试',
  '兼容性测试',
  '界面测试',
  '回归测试',
  '其他',
] as const;
export type TestCaseType = (typeof TEST_CASE_TYPES)[number];

/** 测试用例优先级（老前端三档，中文） */
export const TEST_CASE_PRIORITIES = ['高', '中', '低'] as const;
export type TestCasePriority = (typeof TEST_CASE_PRIORITIES)[number];

/** 测试用例状态中文文案（忠实后端 TestCaseStatusEnum name） */
export const TEST_CASE_STATUS_LABELS: Record<TestCaseStatus, string> = {
  DRAFT: '草稿',
  ACTIVE: '生效',
  REVIEW: '评审中',
  ARCHIVED: '已归档',
};

/**
 * 写入侧状态（创建/更新）：不允许 ARCHIVED。
 * 后端 TestCaseServiceImpl 显式拒绝（创建："不能以归档状态创建测试用例"；
 * 更新："归档测试用例必须使用专用归档入口"），UI 若渲染该选项会运行期 400。
 */
export type TestCaseWritableStatus = Exclude<TestCaseStatus, 'ARCHIVED'>;

/** 新建用例载荷（忠实于后端 TestCaseCreateRequest） */
export interface TestCaseCreatePayload {
  title: string;
  description?: string;
  caseNumber?: string;
  testType?: TestCaseType;
  priority?: TestCasePriority;
  status?: TestCaseWritableStatus;
  projectId: number;
  testSuiteId?: number;
  assigneeId?: number;
  preconditions?: string;
  testSteps?: string;
  expectedResult?: string;
  actualResult?: string;
  testData?: string;
  environmentRequirements?: string;
  attachments?: string;
  tags?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  /** 'YYYY-MM-DDTHH:mm:ss' */
  lastExecutedAt?: string;
  executionCount?: number;
  passCount?: number;
  failCount?: number;
  skipCount?: number;
  /** 关联验证的需求 id 列表 */
  verifiesRequirementIds?: number[];
}

/**
 * 更新用例载荷（忠实于后端 TestCaseUpdateRequest；id 必传）。
 * - 字段级更新：除 id 外全可选。后端只应用非空字段（BaseTestCaseUpdater 风格），
 *   且更新时允许省略 projectId（提供时必须与存储一致，否则报"所属项目创建后不可修改"）。
 * - 明确不含 verifiesRequirementIds：该字段仅存在于 CreateRequest
 *   （BaseTestCaseCreator 注释"仅供标准创建命令建立需求验证关系；普通更新不承载该意图"），
 *   更新接口收到会静默忽略（Spring 默认 FAIL_ON_UNKNOWN_PROPERTIES=false），
 *   类型若暴露它会造成"无报错但关系未变"的静默 no-op 陷阱。
 */
export interface TestCaseUpdatePayload
  extends Omit<TestCaseCreatePayload, 'verifiesRequirementIds' | 'title' | 'projectId'> {
  id: number;
  title?: string;
  projectId?: number;
}

/**
 * 测试用例（忠实于后端 TestCaseResponse + AbstractResponse）。
 * 独立定义（不继承 CreatePayload）：响应含 AbstractResponse 的
 * createdAt/updatedAt（秒级 Long），且各标量字段可为 null（Jackson 透出 null），
 * 与仓库内 DefectResponse 的建模惯例一致。
 */
export interface TestCaseResponse {
  id: number;
  createdAt: number | null;
  updatedAt: number | null;
  title: string;
  description: string | null;
  caseNumber: string | null;
  testType: TestCaseType | null;
  priority: TestCasePriority | null;
  status: TestCaseStatus;
  projectId: number;
  testSuiteId: number | null;
  creatorId: number | null;
  assigneeId: number | null;
  preconditions: string | null;
  testSteps: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  testData: string | null;
  environmentRequirements: string | null;
  attachments: string | null;
  tags: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  /** 'YYYY-MM-DDTHH:mm:ss' */
  lastExecutedAt: string | null;
  executionCount: number | null;
  passCount: number | null;
  failCount: number | null;
  skipCount: number | null;
}

/** 用例查询条件（忠实于后端 TestCaseQueryRequest；projectId 为必填项） */
export interface TestCaseQueryRequest {
  title?: string;
  caseNumber?: string;
  testType?: TestCaseType;
  priority?: TestCasePriority;
  status?: TestCaseStatus;
  projectId: number;
  testSuiteId?: number;
  creatorId?: number;
  assigneeId?: number;
}

/**
 * 用例高级搜索条件（忠实于后端 TestCaseAdvancedQueryRequest）。
 * 时间范围字段后端为 Instant，ISO 字符串收发，此处类型化为 string。
 */
export interface TestCaseAdvancedQuery {
  keyword?: string;
  statusList?: TestCaseStatus[];
  priorityList?: TestCasePriority[];
  testTypeList?: TestCaseType[];
  assigneeIds?: number[];
  creatorIds?: number[];
  createTimeStart?: string;
  createTimeEnd?: string;
  updateTimeStart?: string;
  updateTimeEnd?: string;
  /** 必填：后端权限解析 fail-closed，空集合直接拒绝 */
  projectIds: number[];
  testSuiteIds?: number[];
  tags?: string[];
  minEstimatedDuration?: number;
  maxEstimatedDuration?: number;
  minActualDuration?: number;
  maxActualDuration?: number;
  minExecutionCount?: number;
  maxExecutionCount?: number;
  minPassRate?: number;
  maxPassRate?: number;
  lastExecutedStart?: string;
  lastExecutedEnd?: string;
  hasAttachments?: boolean;
  /** 排序字段：createTime/updateTime/executionCount/passRate/estimatedDuration */
  orderBy?: string;
  /** ASC 升序 / DESC 降序 */
  orderDirection?: 'ASC' | 'DESC';
}
