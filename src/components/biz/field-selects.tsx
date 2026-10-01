import {
  AppWindow,
  BookMarked,
  BookOpen,
  Bug,
  CalendarOff,
  CheckSquare,
  CircleDashed,
  CircleEllipsis,
  Code,
  FileText,
  FlaskConical,
  Gauge,
  Layers,
  LayoutGrid,
  Package,
  Shield,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Person, Priority, Project, ReleaseVersion, RequirementType, Sprint } from "@/lib/pm/domain";
import { VERSION_STATUS_LABEL } from "@/lib/pm/domain";
import { IssueTypeIcon } from "@/components/biz/issue-type-icon";
import { OptionSelect } from "@/components/biz/option-select";
import { PersonAvatar } from "@/components/biz/person-avatar";
import { PriorityMark } from "@/components/biz/priority-mark";
import { severityLabel } from "@/components/biz/severity";
import { severityTone, sprintTone, toneDotClass, versionStatusTone } from "@/components/biz/state-tone";

const sprintStateLabel = (state: Sprint["state"]) => (state === "active" ? "进行中" : state === "planned" ? "规划中" : "已完成");

function Dot({ tone }: { tone: keyof typeof toneDotClass }) {
  return <span className={`size-2 rounded-full ${toneDotClass[tone]}`} />;
}

function KeyBadge({ value }: { value: string }) {
  return <span className="type-key rounded-sm bg-primary-soft px-1">{value}</span>;
}

export function KindSelect({
  value,
  onChange,
  allowAll = false,
  label = "类型",
}: {
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
  label?: string;
}) {
  const kinds: { id: string; label: string; icon: ReactNode }[] = [
    { id: "requirement", label: "需求", icon: <BookMarked className="size-4 text-story" /> },
    { id: "task", label: "任务", icon: <IssueTypeIcon item={{ kind: "task", requirementType: null, taskType: "开发任务" }} /> },
    { id: "defect", label: "缺陷", icon: <IssueTypeIcon item={{ kind: "defect", requirementType: null, taskType: null }} /> },
  ];
  return (
    <OptionSelect
      label={label}
      value={value}
      onChange={onChange}
      options={[
        ...(allowAll ? [{ id: "all", label: "全部类型", icon: <LayoutGrid className="size-4 text-faint" /> }] : []),
        ...kinds.map((kind) => ({ id: kind.id, label: kind.label, icon: kind.icon })),
      ]}
    />
  );
}

export function PrioritySelect({ value, onChange, label = "优先级" }: { value: Priority; onChange: (priority: Priority) => void; label?: string }) {
  const options: { id: Priority; label: string }[] = [
    { id: "HIGH", label: "高" },
    { id: "MEDIUM", label: "中" },
    { id: "LOW", label: "低" },
  ];
  return (
    <OptionSelect
      label={label}
      value={value}
      onChange={(id) => onChange(id as Priority)}
      options={options.map((option) => ({ ...option, icon: <PriorityMark priority={option.id} /> }))}
    />
  );
}

export function PersonSelect({
  people,
  value,
  onChange,
  label = "负责人",
  allowEmpty = true,
  emptyLabel = "未分配",
  showRole = false,
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  showRole?: boolean;
}) {
  return (
    <OptionSelect
      label={label}
      value={value}
      onChange={onChange}
      options={[
        ...(allowEmpty ? [{ id: "", label: emptyLabel, icon: <UserRound className="size-4 text-faint" /> }] : []),
        ...people.map((person) => ({
          id: person.id,
          label: person.name,
          hint: showRole ? person.role : undefined,
          icon: <PersonAvatar person={person} />,
        })),
      ]}
    />
  );
}

export function SprintSelect({
  sprints,
  value,
  onChange,
  label = "迭代",
  allowEmpty = true,
  emptyLabel = "未排期",
  showState = true,
}: {
  sprints: Sprint[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  showState?: boolean;
}) {
  return (
    <OptionSelect
      label={label}
      value={value}
      onChange={onChange}
      options={[
        ...(allowEmpty ? [{ id: "", label: emptyLabel, icon: <CalendarOff className="size-4 text-faint" /> }] : []),
        ...sprints.map((sprint) => ({
          id: sprint.id,
          label: sprint.name,
          hint: showState ? sprintStateLabel(sprint.state) : undefined,
          icon: <Dot tone={sprintTone(sprint.state)} />,
        })),
      ]}
    />
  );
}

export function VersionSelect({
  versions,
  value,
  onChange,
  label = "版本",
  allowEmpty = true,
  emptyLabel = "未纳入版本",
}: {
  versions: ReleaseVersion[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <OptionSelect
      label={label}
      value={value}
      onChange={onChange}
      options={[
        ...(allowEmpty ? [{ id: "", label: emptyLabel, icon: <Package className="size-4 text-faint" /> }] : []),
        ...versions.map((version) => ({
          id: version.id,
          label: `${version.versionNumber} ${version.name}`,
          hint: VERSION_STATUS_LABEL[version.status],
          icon: <Dot tone={versionStatusTone(version.status)} />,
        })),
      ]}
    />
  );
}

const SEVERITY = ["BLOCKER", "CRITICAL", "MAJOR", "NORMAL", "MINOR", "TRIVIAL"] as const;

export function SeveritySelect({ value, onChange, label = "严重程度" }: { value: string; onChange: (severity: string) => void; label?: string }) {
  return (
    <OptionSelect
      label={label}
      value={value}
      onChange={onChange}
      options={SEVERITY.map((id) => ({ id, label: severityLabel(id), icon: <Dot tone={severityTone(id)} /> }))}
    />
  );
}

export function RequirementTypeSelect({
  value,
  onChange,
  label = "需求类型",
}: {
  value: RequirementType;
  onChange: (type: RequirementType) => void;
  label?: string;
}) {
  const options: { id: RequirementType; label: string; icon: ReactNode }[] = [
    { id: "Epic", label: "史诗", icon: <Layers className="size-4 text-epic" /> },
    { id: "Story", label: "故事", icon: <BookOpen className="size-4 text-story" /> },
    { id: "Task", label: "需求任务", icon: <CheckSquare className="size-4 text-task" /> },
  ];
  return <OptionSelect label={label} value={value} onChange={(id) => onChange(id as RequirementType)} options={options} />;
}

const TASK_TYPES = [
  { id: "开发任务", icon: <Code className="size-4 text-task" /> },
  { id: "测试任务", icon: <FlaskConical className="size-4 text-story" /> },
  { id: "文档任务", icon: <FileText className="size-4 text-primary-ink" /> },
  { id: "其他", icon: <CircleEllipsis className="size-4 text-faint" /> },
];

export function TaskTypeSelect({ value, onChange, label = "任务类型" }: { value: string; onChange: (type: string) => void; label?: string }) {
  return <OptionSelect label={label} value={value} onChange={onChange} options={TASK_TYPES.map((type) => ({ id: type.id, label: type.id, icon: type.icon }))} />;
}

const DEFECT_TYPES = [
  { id: "功能缺陷", icon: <Bug className="size-4 text-defect" /> },
  { id: "性能缺陷", icon: <Gauge className="size-4 text-warning" /> },
  { id: "安全缺陷", icon: <Shield className="size-4 text-danger" /> },
  { id: "界面缺陷", icon: <AppWindow className="size-4 text-task" /> },
  { id: "其他", icon: <CircleDashed className="size-4 text-faint" /> },
];

export function DefectTypeSelect({ value, onChange, label = "缺陷类型" }: { value: string; onChange: (type: string) => void; label?: string }) {
  return <OptionSelect label={label} value={value} onChange={onChange} options={DEFECT_TYPES.map((type) => ({ id: type.id, label: type.id, icon: type.icon }))} />;
}

export function ProjectSelect({
  projects,
  value,
  onChange,
  label = "项目",
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <OptionSelect
      label={label}
      value={value}
      onChange={onChange}
      options={projects.map((project) => ({
        id: project.id,
        label: project.name,
        icon: <KeyBadge value={project.key} />,
      }))}
    />
  );
}
