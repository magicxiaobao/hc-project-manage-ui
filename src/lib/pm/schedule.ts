export type ScheduleType = "FS" | "SS" | "FF" | "SF";
export type PlanEdge = "start" | "end";

export interface PlanRange {
  start: string;
  end: string;
}

export interface ScheduleLink {
  id: string;
  predecessorId: string;
  successorId: string;
  dependencyType: ScheduleType;
  lagDays: number;
  status: string;
}

export interface ScheduleHit {
  id: string;
  predecessorId: string;
  successorId: string;
  dependencyType: ScheduleType;
  lagDays: number;
  ready: string;
  actual: string;
  from: PlanEdge;
  to: PlanEdge;
}

export function dependencyAnchor(type: ScheduleType): { from: PlanEdge; to: PlanEdge } {
  if (type === "SS") return { from: "start", to: "start" };
  if (type === "FF") return { from: "end", to: "end" };
  if (type === "SF") return { from: "start", to: "end" };
  return { from: "end", to: "start" };
}

function dayNumber(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function isoFromDay(day: number) {
  const date = new Date(day * 86_400_000);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dateNumber = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${dateNumber}`;
}

export function shiftPlanDay(iso: string, days: number) {
  return isoFromDay(dayNumber(iso) + days);
}

function edgeDate(plan: PlanRange, edge: PlanEdge) {
  return edge === "start" ? plan.start : plan.end;
}

/** 把后置推到满足这一条依赖。只往后推，不把已满足的日期拉早。开始约束保持工期，结束约束只延长结束日。 */
export function pushPlan(type: ScheduleType, predecessor: PlanRange, successor: PlanRange, lagDays: number): PlanRange {
  const anchor = dependencyAnchor(type);
  const ready = shiftPlanDay(edgeDate(predecessor, anchor.from), lagDays);
  let { start, end } = successor;
  if (anchor.to === "start" && start < ready) {
    const span = dayNumber(end) - dayNumber(start);
    start = ready;
    end = isoFromDay(dayNumber(start) + span);
  } else if (anchor.to === "end" && end < ready) {
    end = ready;
  }
  if (end < start) end = start;
  return { start, end };
}

export function findScheduleHits(links: ScheduleLink[], plans: Record<string, PlanRange | undefined>): ScheduleHit[] {
  const hits: ScheduleHit[] = [];
  for (const link of links) {
    if (link.status !== "ACTIVE") continue;
    const predecessor = plans[link.predecessorId];
    const successor = plans[link.successorId];
    if (!predecessor || !successor) continue;
    const anchor = dependencyAnchor(link.dependencyType);
    const ready = shiftPlanDay(edgeDate(predecessor, anchor.from), link.lagDays);
    const actual = edgeDate(successor, anchor.to);
    if (ready > actual) {
      hits.push({
        id: link.id,
        predecessorId: link.predecessorId,
        successorId: link.successorId,
        dependencyType: link.dependencyType,
        lagDays: link.lagDays,
        ready,
        actual,
        from: anchor.from,
        to: anchor.to,
      });
    }
  }
  return hits;
}

/** 先放下被拖动的计划，再按有效依赖把违反的后置往后推，直到稳定。 */
export function alignPlans(plans: Record<string, PlanRange>, links: ScheduleLink[], focusId: string, proposed: PlanRange): Record<string, PlanRange> {
  const next: Record<string, PlanRange> = {};
  for (const [id, plan] of Object.entries(plans)) next[id] = { start: plan.start, end: plan.end };
  next[focusId] = { start: proposed.start, end: proposed.end };
  const active = links.filter((link) => link.status === "ACTIVE" && next[link.predecessorId] && next[link.successorId]);
  for (let pass = 0; pass <= active.length; pass += 1) {
    let changed = false;
    for (const link of active) {
      const successor = next[link.successorId];
      const pushed = pushPlan(link.dependencyType, next[link.predecessorId], successor, link.lagDays);
      if (pushed.start !== successor.start || pushed.end !== successor.end) {
        next[link.successorId] = pushed;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}
