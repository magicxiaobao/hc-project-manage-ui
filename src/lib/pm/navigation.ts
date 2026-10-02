import type { ItemKind } from "./domain";

export type ProjectViewSearch = {
  query?: string;
  kind?: "all" | ItemKind;
  mine?: boolean;
  hideDone?: boolean;
  board?: string;
  sprint?: string;
  cancelled?: boolean;
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
  };
}

export type ReturnFocus = { key?: string; label?: string; text?: string; tag?: "BUTTON" | "A" };
export type ItemOrigin = {
  href: string;
  index: number;
  focus: ReturnFocus;
  scrollTop: number;
  scrollLeft: number;
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
  return {
    href: v.href,
    index: v.index as number,
    focus: {
      key: shortText(f.key),
      label: shortText(f.label),
      text: shortText(f.text),
      tag: f.tag === "BUTTON" || f.tag === "A" ? f.tag : undefined,
    },
    scrollTop:
      typeof v.scrollTop === "number" && Number.isFinite(v.scrollTop) && v.scrollTop >= 0
        ? v.scrollTop
        : 0,
    scrollLeft:
      typeof v.scrollLeft === "number" && Number.isFinite(v.scrollLeft) && v.scrollLeft >= 0
        ? v.scrollLeft
        : 0,
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
