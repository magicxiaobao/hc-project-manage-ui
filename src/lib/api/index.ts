/**
 * Phase 0 API 层入口。
 *
 * 约定：
 * - 所有后端调用走这里的 typed API 模块，不在组件里手写 fetch/URL。
 * - 契约（路径、请求体、响应信封）忠实于 hc-project-manage 老前端，
 *   变更契约前先更新契约测试（src/lib/api/__tests__/contract.test.ts）。
 */
export * from './types';
export * from './dashboard-types';
export * from './project-stats-types';
export * from './worklog-types';
export * from './notification-types';
export * from './requirement-types';
export * from './task-types';
export * from './defect-types';
export * from './testCase-types';
export * from './testSuite-types';
export * from './testRun-types';
export * from './testExecution-types';
export * from './version-types';
export * from './release-types';
export * from './releaseEnvironment-types';
export * from './board-types';
export * from './sprint-types';
export * from './task-dependency-types';
export * from './gantt-types';
export * from './trace-types';
// 以下 4 个名字在 requirement-types（P2）与 trace-types（P3）中各自定义且语义不同；
// 显式指定 barrel 导出 P2 版本（保持 P2 主干行为），P3 代码按既有方式从 '@/lib/api/trace-types' 直接导入其版本。
export type { AlmObjectKey, RequirementImpact, RequirementTrace, TraceNodeSummary } from './requirement-types';
export * from './system-types';
export * from './client';
export { authApi } from './auth';
export { dashboardApi, dashboardWidgetApi } from './dashboard';
export { projectStatsApi } from './project-stats';
export { workLogApi } from './worklog';
export { notificationApi } from './notification';
export { projectApi } from './project';
export { requirementApi } from './requirement';
export { taskApi } from './task';
export { defectApi } from './defect';
export { testCaseApi } from './testCase';
export { testSuiteApi } from './testSuite';
export { testRunApi } from './testRun';
export { testExecutionApi } from './testExecution';
export { versionApi } from './version';
export { releaseApi } from './release';
export { releaseEnvironmentApi } from './releaseEnvironment';
export { boardApi, boardColumnApi } from './board';
export { sprintApi } from './sprint';
export { taskDependencyApi } from './task-dependency';
export { ganttApi, milestoneApi } from './gantt';
export { requirementTraceApi, traceabilityRelationApi } from './trace';
export { systemApi } from './system';
export { useAuthStore } from './auth-store';
