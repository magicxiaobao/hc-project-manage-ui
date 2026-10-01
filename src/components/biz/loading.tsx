import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)} />;
}

export function Loading({
  variant = "section",
  label = "加载中",
  children,
}: {
  variant?: "inline" | "section" | "page";
  label?: string;
  children?: ReactNode;
}) {
  if (variant === "inline") {
    return (
      <span className="type-caption inline-flex items-center gap-2 text-muted" role="status">
        <Spinner className="size-3.5" />
        {label}
      </span>
    );
  }
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-muted", variant === "page" ? "min-h-64" : "px-4 py-8")} role="status">
      <Spinner />
      <span className="type-body">{label}</span>
      {children}
    </div>
  );
}
