import { Button } from "@heroui/react";
import type { ComponentProps, CSSProperties } from "react";
import type { StateTone } from "@/components/biz/state-tone";

type ButtonProps = ComponentProps<typeof Button>;

function tonePaint(tone: StateTone, active: boolean): { variant: NonNullable<ButtonProps["variant"]>; style?: CSSProperties } {
  if (tone === "progress") return { variant: "primary" };
  if (tone === "danger") return { variant: active ? "danger" : "danger-soft" };
  if (tone === "done") {
    return {
      variant: "ghost",
      style: active
        ? paint("var(--color-success)", "var(--color-success-ink)", "var(--color-surface)")
        : paint("var(--color-success-soft)", "var(--color-success-wash)", "var(--color-success)"),
    };
  }
  if (tone === "review") {
    return {
      variant: "ghost",
      style: active ? paint("var(--color-warning)", "var(--color-warning-ink)", "var(--color-surface)") : paint("var(--color-warning-soft)", "var(--color-warning-wash)", "var(--color-warning-ink)"),
    };
  }
  return { variant: active ? "secondary" : "outline" };
}

function paint(bg: string, hover: string, fg: string): CSSProperties {
  return {
    "--button-bg": bg,
    "--button-bg-hover": hover,
    "--button-bg-pressed": hover,
    "--button-fg": fg,
  } as CSSProperties;
}

export function StateAction({
  tone,
  active = false,
  style,
  ...props
}: { tone: StateTone; active?: boolean } & Omit<ButtonProps, "variant">) {
  const paintStyle = tonePaint(tone, active);
  return <Button size="sm" variant={paintStyle.variant} style={{ ...paintStyle.style, ...style }} {...props} />;
}
