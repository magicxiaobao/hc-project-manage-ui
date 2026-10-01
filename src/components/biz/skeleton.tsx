import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function Bone({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("animate-pulse rounded-sm bg-line", className)} style={style} />;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="页面加载中">
      <Bone className="h-7 w-40" />
      <Bone className="h-4 w-64 max-w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Bone key={index} className="h-16" />
        ))}
      </div>
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <Bone className="size-4 shrink-0" />
            <Bone className="h-4 w-14" />
            <Bone className="h-4 min-w-0 flex-1" />
            <Bone className="hidden h-5 w-14 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4" aria-busy="true" aria-label="看板加载中">
      <div className="flex items-end justify-between gap-3">
        <Bone className="h-7 w-24" />
        <Bone className="h-8 w-40" />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, column) => (
          <div key={column} className="flex w-56 shrink-0 flex-col gap-2">
            <Bone className="h-4 w-16" />
            {Array.from({ length: 3 }, (_, row) => (
              <Bone key={row} className="h-24" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GanttSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="甘特图加载中">
      <Bone className="h-7 w-24" />
      <Bone className="h-4 w-80 max-w-full" />
      <div className="overflow-hidden rounded-sm border border-border bg-surface">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="grid h-16 grid-cols-[148px_minmax(0,1fr)] items-center gap-3 border-b border-border px-3 last:border-b-0">
            <Bone className="h-4 w-24" />
            <Bone className="h-6" style={{ width: `${28 + ((index * 17) % 55)}%`, marginLeft: `${(index * 9) % 30}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6" aria-busy="true" aria-label="事项加载中">
      <Bone className="h-4 w-24" />
      <Bone className="h-8 w-2/3" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Bone key={index} className="h-12" />
        ))}
      </div>
      <Bone className="h-28" />
    </div>
  );
}

export function ContentSkeleton({ pathname }: { pathname: string }) {
  if (/^\/p\/[^/]+\/?$/.test(pathname)) return <BoardSkeleton />;
  if (pathname.includes("/gantt")) return <GanttSkeleton />;
  if (pathname.includes("/items/")) return <DetailSkeleton />;
  return <PageSkeleton />;
}
