import { Chip } from "@heroui/react";
import type { ItemKind, Sprint, VersionStatus } from "@/lib/pm/domain";
import { statusLabel, VERSION_STATUS_LABEL } from "@/lib/pm/domain";
import { severityLabel } from "@/components/biz/severity";
import { itemStatusTone, severityTone, sprintTone, versionStatusTone, type StateTone } from "@/components/biz/state-tone";

const CHIP_COLOR = {
  neutral: "default",
  progress: "accent",
  review: "warning",
  done: "success",
  danger: "danger",
  revert: "default",
} as const;

export function StateChip({ tone, children }: { tone: StateTone; children: string }) {
  return (
    <Chip size="sm" color={CHIP_COLOR[tone]} variant="soft">
      <Chip.Label>{children}</Chip.Label>
    </Chip>
  );
}

export function StatusChip({ kind, status }: { kind: ItemKind; status: string }) {
  return <StateChip tone={itemStatusTone(kind, status)}>{statusLabel(kind, status)}</StateChip>;
}

export function SprintStateChip({ state }: { state: Sprint["state"] }) {
  const label = state === "active" ? "进行中" : state === "planned" ? "规划中" : "已完成";
  return <StateChip tone={sprintTone(state)}>{label}</StateChip>;
}

export function VersionStatusChip({ status }: { status: VersionStatus }) {
  return <StateChip tone={versionStatusTone(status)}>{VERSION_STATUS_LABEL[status]}</StateChip>;
}

export function SeverityChip({ severity }: { severity: string }) {
  return <StateChip tone={severityTone(severity)}>{severityLabel(severity)}</StateChip>;
}
