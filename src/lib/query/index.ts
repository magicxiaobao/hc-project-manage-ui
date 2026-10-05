/**
 * Phase 1 react-query 数据层入口。
 *
 * 约定：
 * - 所有后端数据获取走这里的 hooks，不在组件里手写 useQuery + fetch/URL。
 * - queryKey 一律走 queryKeys.* 工厂，不手写数组。
 * - 错误展示用 toUserMessage(err) 转中文文案；登录失效用 isAuthExpiredError 识别。
 */
export { createQueryClient, isRetryableQueryError } from './client';
export { clearQueryCache, setQueryCacheClearer } from './session';
export { queryKeys } from './keys';
export { isAuthExpiredError, toUserMessage } from './error';
export { useCreateProject, useProjectDetail, useProjectEnums, useProjectIdByKey, useProjectList, resolveProjectIdByKey } from './hooks/useProjects';
export type { ProjectListParams } from './hooks/useProjects';
export { useRequirementList, useRequirementOptions } from './hooks/useRequirements';
export type { RequirementListParams, RequirementOptions } from './hooks/useRequirements';
export { useDefectList, useDefectStatusOptions, useDefectBoard, useDefectStatistics, useCreateDefect, useDefectDetail, useUpdateDefect, useUpdateDefectStatus, useChangeDefectSeverity, buildChangeDefectSeverityOptions, DEFECT_TRANSITIONS_BY_STATUS, defectTransitionTargets, defectNeedsReason, defectNeedsActor, defectTransitionLabel } from './hooks/useDefects';
export type { DefectListParams, DefectActorField } from './hooks/useDefects';
export { useTaskList } from './hooks/useTasks';
export type { TaskListParams } from './hooks/useTasks';
export {
  TASK_TRANSITIONS_BY_STATUS,
  useAssignTask,
  useCreateTask,
  useCreateTaskComment,
  useTaskComments,
  useTaskDetail,
  useUpdateTaskStatus,
  taskNeedsActorReason,
  taskNeedsAssigneeConfirm,
  taskNeedsReason,
  taskNeedsReopenReason,
  taskTransitionLabel,
  taskTransitionTargets,
} from './hooks/useTasks';
export {
  useAllowedTransitions,
  useCreateRequirementComment,
  useRequirementChildren,
  useRequirementComments,
  useRequirementDetail,
  useRequirementHierarchy,
  useRequirementImpact,
  useRequirementTrace,
  useTraceMatrix,
  useTransitionHistory,
  useTransitionRequirement,
  transitionFieldRequirements,
} from './hooks/useRequirements';
export type { TraceMatrixParams, TransitionFieldRequirements } from './hooks/useRequirements';
export {
  normalizeTestCaseListParams,
  useArchiveTestCase,
  useCreateTestCase,
  useDuplicateTestCase,
  useTestCaseDetail,
  useTestCaseList,
  useUpdateTestCase,
} from './hooks/useTestCases';
export type { TestCaseListParams } from './hooks/useTestCases';
export {
  normalizeTestSuiteListParams,
  useCreateTestSuite,
  useInvalidTestSuite,
  useTestSuiteDetail,
  useTestSuiteList,
  useUpdateTestSuite,
  useValidTestSuite,
} from './hooks/useTestSuites';
export type { TestSuiteListParams } from './hooks/useTestSuites';
export {
  normalizeTestRunListParams,
  useCancelTestRun,
  useCompleteExecution,
  useCompleteTestRun,
  useCreateAdHocRun,
  useCreateDefectFromExecution,
  useCreateFullRegression,
  useCreateTargetedRetest,
  useLinkExistingDefect,
  useRetryExecution,
  useStartExecution,
  useStartTestRun,
  useTestRunDetail,
  useTestRunList,
  useTestRunReport,
} from './hooks/useTestRuns';
export type { TestRunListParams } from './hooks/useTestRuns';
export {
  useVersionList,
  useVersionListAll,
  useVersionDetail,
  useCreateVersion,
  useUpdateVersion,
  useTransitionVersion,
  normalizeVersionListParams,
  versionTransitionEvents,
  versionEventRequiresReason,
  buildTransitionVersionOptions,
} from './hooks/useVersions';
export type { VersionListParams, VersionListAllParams } from './hooks/useVersions';
export {
  useCreateReleaseEnvironment,
  useDisableReleaseEnvironment,
  useReleaseEnvironmentList,
  useUpdateReleaseEnvironment,
} from './hooks/useReleaseEnvironments';
export type { ReleaseEnvironmentListParams } from './hooks/useReleaseEnvironments';
export {
  normalizeReleaseListParams,
  useApproveRelease,
  useCancelRelease,
  useCopyReleaseAsDraft,
  useCreateReleaseDraft,
  useDeleteReleaseDraft,
  usePreviewReleaseGates,
  useRecordFailed,
  useRecordReleased,
  useRejectRelease,
  useReleaseDetail,
  useReleaseList,
  useReleaseListAll,
  useRevokeReleaseWaiver,
  useRollbackReleaseAsDraft,
  useSubmitRelease,
  useUpdateReleaseDraft,
  useWaiveReleaseGate,
} from './hooks/useReleases';
export type { ReleaseListParams, ReleaseListAllParams } from './hooks/useReleases';
