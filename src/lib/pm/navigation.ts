import { COLUMNS, type ColumnId, type ItemKind } from "./domain";

export type ProjectViewSearch = {
  query?: string;
  kind?: "all" | ItemKind;
  mine?: boolean;
  hideDone?: boolean;
  board?: string;
  sprint?: string;
  cancelled?: boolean;
  assignees?: string[];
  tag?: string;
  sort?: "key" | "title" | "priority" | "status" | "points" | "updated";
  ascending?: boolean;
};

export function parseProjectViewSearch(value: Record<string, unknown>): ProjectViewSearch {
  return {
    query: typeof value.query === "string" ? value.query : undefined,
    kind:
      typeof value.kind === "string" &&
      ["all", "requirement", "task", "defect"].includes(value.kind)
        ? (value.kind as ProjectViewSearch["kind"])
        : undefined,
    mine: typeof value.mine === "boolean" ? value.mine : undefined,
    hideDone: typeof value.hideDone === "boolean" ? value.hideDone : undefined,
    board: typeof value.board === "string" ? value.board : undefined,
    sprint: typeof value.sprint === "string" ? value.sprint : undefined,
    cancelled: typeof value.cancelled === "boolean" ? value.cancelled : undefined,
    assignees:
      Array.isArray(value.assignees) && value.assignees.every((id) => typeof id === "string")
        ? value.assignees
        : undefined,
    tag: typeof value.tag === "string" ? value.tag : undefined,
    sort:
      typeof value.sort === "string" &&
      ["key", "title", "priority", "status", "points", "updated"].includes(value.sort)
        ? (value.sort as ProjectViewSearch["sort"])
        : undefined,
    ascending: typeof value.ascending === "boolean" ? value.ascending : undefined,
  };
}

export type ReturnFocus = {
  key?: string;
  label?: string;
  text?: string;
  tag?: "BUTTON" | "A" | "SELECT";
};
export type ItemOrigin = {
  href: string;
  index: number;
  focus: ReturnFocus;
  scrollTop: number;
  scrollLeft: number;
  columnScroll?: Partial<Record<ColumnId, number>>;
  browseIds?: string[];
};

declare module "@tanstack/history" {
  interface HistoryState {
    pmItemOrigin?: ItemOrigin;
  }
}

export function isItemPath(path: string): boolean {
  return /^\/p\/[^/]+\/items\/[^/]+\/?$/.test(path);
}

export function validReturnHref(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return false;
  const path = value.split(/[?#]/)[0];
  return (
    ["/", "/projects", "/projects/new", "/me", "/inbox"].includes(path) ||
    /^\/p\/[A-Za-z0-9_-]+(?:\/(?:dashboard|backlog|sprints|issues|defects|assignment|requirements|trace|gantt|dependencies|tests|worklogs|releases|stats|settings))?\/?$/.test(
      path,
    )
  );
}

export function readItemOrigin(value: unknown): ItemOrigin | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (!validReturnHref(v.href) || !Number.isSafeInteger(v.index) || (v.index as number) < 0)
    return undefined;
  const f = v.focus && typeof v.focus === "object" ? (v.focus as Record<string, unknown>) : {};
  const shortText = (x: unknown) => (typeof x === "string" && x.length <= 300 ? x : undefined);
  const columnScroll: Partial<Record<ColumnId, number>> = {};
  if (v.columnScroll && typeof v.columnScroll === "object" && !Array.isArray(v.columnScroll)) {
    const positions = v.columnScroll as Record<string, unknown>;
    for (const { id } of COLUMNS) {
      const top = positions[id];
      if (typeof top === "number" && Number.isFinite(top) && top >= 0) columnScroll[id] = top;
    }
  }
  return {
    href: v.href,
    index: v.index as number,
    focus: {
      key: shortText(f.key),
      label: shortText(f.label),
      text: shortText(f.text),
      tag: f.tag === "BUTTON" || f.tag === "A" || f.tag === "SELECT" ? f.tag : undefined,
    },
    scrollTop:
      typeof v.scrollTop === "number" && Number.isFinite(v.scrollTop) && v.scrollTop >= 0
        ? v.scrollTop
        : 0,
    scrollLeft:
      typeof v.scrollLeft === "number" && Number.isFinite(v.scrollLeft) && v.scrollLeft >= 0
        ? v.scrollLeft
        : 0,
    ...(Object.keys(columnScroll).length ? { columnScroll } : {}),
    ...(Array.isArray(v.browseIds) &&
    v.browseIds.every((id) => typeof id === "string" && id.length <= 300)
      ? { browseIds: [...v.browseIds] as string[] }
      : {}),
  };
}

export function returnHistoryDelta(
  origin: ItemOrigin | undefined,
  currentIndex: number,
): number | undefined {
  if (!origin || !Number.isSafeInteger(currentIndex) || currentIndex <= origin.index)
    return undefined;
  return origin.index - currentIndex;
}
