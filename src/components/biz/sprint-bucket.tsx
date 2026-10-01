import type { ReactNode } from "react";
import type { Sprint } from "@/lib/pm/domain";
import { formatDay } from "@/lib/pm/domain";
import { StateAction } from "@/components/biz/state-action";
import { StateChip } from "@/components/biz/status-chip";
import { sprintTone, type StateTone } from "@/components/biz/state-tone";
import { cn } from "@/lib/utils";

export function SprintBucket({
  title,
  badge,
  badgeTone = "neutral",
  goal,
  schedule,
  count,
  over,
  actions,
  onDragOver,
  onDrop,
  children,
}: {
  title: string;
  badge?: string;
  badgeTone?: StateTone;
  goal?: string;
  schedule?: ReactNode;
  count: number;
  over: boolean;
  actions?: ReactNode;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-sm border bg-surface", over ? "border-primary" : "border-border")} onDragOver={onDragOver} onDrop={onDrop}>
      <header className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="type-section">{title}</h2>
            {badge ? <StateChip tone={badgeTone}>{badge}</StateChip> : null}
            <span className="type-caption ml-auto sm:ml-2">{count}</span>
          </div>
          {goal ? <p className="type-caption mt-1">{goal}</p> : null}
          {schedule ? <div className="mt-2 max-w-sm">{schedule}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      <ul className="border-t border-border">{children}</ul>
    </section>
  );
}

export function sprintBadge(state: Sprint["state"]) {
  if (state === "active") return "进行中";
  if (state === "planned") return "规划中";
  return "已完成";
}

export function sprintDates(sprint: Sprint) {
  return `${formatDay(sprint.start)} – ${formatDay(sprint.end)}`;
}

export function SprintActions({
  state,
  confirming,
  onStart,
  onAskComplete,
  onCancel,
  onComplete,
}: {
  state: Sprint["state"];
  confirming: boolean;
  onStart: () => void;
  onAskComplete: () => void;
  onCancel: () => void;
  onComplete: () => void;
}) {
  if (state === "planned") {
    return (
      <StateAction tone="progress" onPress={onStart}>
        开始迭代
      </StateAction>
    );
  }
  if (state !== "active") return null;
  if (!confirming) {
    return (
      <StateAction tone="done" onPress={onAskComplete}>
        完成迭代
      </StateAction>
    );
  }
  return (
    <>
      <StateAction tone="danger" onPress={onComplete}>
        确认，未完成退回待办
      </StateAction>
      <StateAction tone="neutral" onPress={onCancel}>
        取消
      </StateAction>
    </>
  );
}

export { sprintTone };
