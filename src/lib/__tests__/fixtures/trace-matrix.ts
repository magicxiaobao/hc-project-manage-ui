import type { AlmObjectType, RequirementMatrixRow, TraceNodeSummary } from "../../api/trace-types";
export function summary(
  objectType: AlmObjectType,
  objectId: number,
  status: string | null,
): TraceNodeSummary {
  return {
    objectType,
    objectId,
    displayName: `${objectType}-${status}-${objectId}`,
    status,
    assigneeId: null,
    runId: null,
    runType: null,
    direct: true,
    path: [
      ...(objectType === "REQUIREMENT"
        ? []
        : [{ objectType: "REQUIREMENT" as const, objectId: 1 }]),
      { objectType, objectId },
    ],
  };
}
export function matrixFixture(): RequirementMatrixRow {
  return {
    requirement: summary("REQUIREMENT", 1, "DRAFT"),
    taskSummaries: [summary("TASK", 2, "TODO"), summary("TASK", 3, "COMPLETED")],
    testCaseSummaries: [summary("TEST_CASE", 4, "DRAFT"), summary("TEST_CASE", 5, "ACTIVE")],
    defectSummaries: [summary("DEFECT", 6, "NEW"), summary("DEFECT", 7, "RESOLVED")],
    versionEvidence: {
      total: 2,
      truncated: false,
      items: [
        {
          versionId: 8,
          versionName: null,
          versionStatus: null,
          testEvidenceState: "AVAILABLE",
          evidenceRunId: 10,
          latestExecutionSummaries: [
            {
              runCaseId: 11,
              testCaseId: 5,
              executionId: 12,
              attemptNo: 1,
              status: "COMPLETED",
              result: "PASSED",
            },
          ],
        },
        {
          versionId: 9,
          versionName: "版本9",
          versionStatus: "TESTING",
          testEvidenceState: "STALE_SCOPE",
          evidenceRunId: null,
          latestExecutionSummaries: [],
        },
      ],
    },
  };
}
export function emptyRelations(): RequirementMatrixRow {
  return {
    ...matrixFixture(),
    taskSummaries: [],
    testCaseSummaries: [],
    defectSummaries: [],
    versionEvidence: { total: 0, truncated: false, items: [] },
  };
}
