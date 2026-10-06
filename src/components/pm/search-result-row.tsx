import { Link } from "@tanstack/react-router";
import type { SearchProject, SearchRecord } from "@/lib/query/hooks/useGlobalSearch";
import type { SearchDomain } from "@/lib/search/keyword";
import { statusLabel } from "@/lib/pm/domain";
import { TEST_CASE_STATUS_LABELS } from "@/lib/api/testCase-types";
import { severityLabel } from "@/components/biz/severity";

export function SearchResultRow({
  domain,
  project,
  item,
  disabled,
}: {
  domain: SearchDomain;
  project: SearchProject;
  item: SearchRecord;
  disabled: boolean;
}) {
  const title = disabled ? (
    <span>{item.title}</span>
  ) : domain === "task" ? (
    <Link
      to="/p/$projectKey/issues/$taskId"
      params={{ projectKey: project.projectKey, taskId: String(item.id) }}
    >
      {item.title}
    </Link>
  ) : domain === "defect" ? (
    <Link
      to="/p/$projectKey/defects/$defectId"
      params={{ projectKey: project.projectKey, defectId: String(item.id) }}
    >
      {item.title}
    </Link>
  ) : domain === "requirement" ? (
    <Link
      to="/p/$projectKey/requirements/$requirementId"
      params={{ projectKey: project.projectKey, requirementId: String(item.id) }}
    >
      {item.title}
    </Link>
  ) : (
    <Link
      to="/p/$projectKey/testcases/$testCaseId"
      params={{ projectKey: project.projectKey, testCaseId: String(item.id) }}
    >
      {item.title}
    </Link>
  );
  const status =
    "statusLabel" in item && item.statusLabel
      ? item.statusLabel
      : domain === "testCase"
        ? ((TEST_CASE_STATUS_LABELS as Record<string, string>)[item.status] ?? item.status)
        : statusLabel(domain, item.status);
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-3 last:border-b-0">
      <span className="min-w-0 flex-1 break-words underline-offset-2 hover:underline">{title}</span>
      <span className="type-meta">{project.projectName}</span>
      {domain === "defect" && "severity" in item ? (
        <span className="type-meta">{severityLabel(item.severity)}</span>
      ) : null}
      {domain === "testCase" && "caseNumber" in item ? (
        <span className="type-meta">{item.caseNumber}</span>
      ) : null}
      <span className="type-meta">{status}</span>
    </li>
  );
}
