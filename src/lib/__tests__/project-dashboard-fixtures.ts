import type { ProjectDashboardVO, ProjectGanttVO } from "../api/project-stats-types";
import type { DefectStatisticsResponse } from "../api/defect-types";
export function dashboardFixture(
  id = 3,
  overrides: Partial<ProjectDashboardVO> = {},
): ProjectDashboardVO {
  return {
    projectId: id,
    projectName: `真实项目${id}`,
    progressPercent: 99,
    memberCount: null,
    taskCount: null,
    requirementCount: null,
    totalTasks: 6,
    completedTasks: 2,
    unfinishedTasks: 3,
    cancelledTasks: 1,
    inProgressTasks: 1,
    pendingTasks: 2,
    pausedTasks: 0,
    bugCount: 4,
    versionCount: 0,
    progress: 33,
    milestoneProgress: 50,
    startDate: null,
    endDate: null,
    ...overrides,
  };
}
export function progressFixture(id = 3): ProjectGanttVO {
  return {
    projectId: id,
    projectName: `真实项目${id}`,
    startDate: 1791158400,
    endDate: null,
    tasks: [
      {
        id: 1,
        name: "同日任务",
        start: "2026-10-05",
        end: "2026-10-05",
        status: "已完成",
        type: "任务",
      },
      { id: 2, name: "未排期任务", start: null, end: null, status: "待办", type: "任务" },
    ],
  };
}
export const defectFixture: DefectStatisticsResponse = {
  totalDefects: 4,
  openDefects: 1,
  inProgressDefects: 1,
  testingDefects: 0,
  resolvedDefects: 0,
  closedDefects: 2,
  severityStats: { 主要: 3, 未知: 1 },
  priorityStats: { HIGH: 2, MEDIUM: 2, LOW: 0 },
  typeStats: { 功能: 4 },
};
export const statisticsFixture = {
  totalCount: 100,
  runningCount: 60,
  completedCount: 20,
  pausedCount: 10,
  archivedCount: 20,
};
