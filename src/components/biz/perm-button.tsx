import { Button } from "@heroui/react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { getButtonPermissionSnapshot } from "@/lib/access/button-permissions";
import {
  canUseButton,
  isButtonSession,
  useButtonPermissions,
} from "@/lib/access/use-button-permissions";

type NativeProps = ComponentPropsWithRef<typeof Button>;
// Business effects have one entry point. Also strip these at runtime for JS callers.
type EventProp = Extract<keyof NativeProps, `on${string}`>;
export type PermButtonProps = Omit<NativeProps, EventProp> & {
  code: string;
  mode?: "hidden" | "disabled";
  fallback?: ReactNode;
  onPress?: NativeProps["onPress"];
};

export function PermButton({
  code,
  mode = "hidden",
  fallback = null,
  onPress,
  ...props
}: PermButtonProps) {
  const snapshot = useButtonPermissions();
  const allowed = canUseButton(snapshot, code);
  if (!allowed && mode === "hidden") return <>{fallback}</>;

  const safeProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !/^on[A-Z]/.test(key)),
  ) as Omit<NativeProps, EventProp>;
  return (
    <Button
      {...safeProps}
      type={props.type ?? "button"}
      isDisabled={Boolean(props.isDisabled) || !allowed}
      onPress={(event) => {
        const current = getButtonPermissionSnapshot();
        if (
          props.isDisabled ||
          props.isPending ||
          !isButtonSession(current, snapshot) ||
          !canUseButton(current, code)
        )
          return;
        onPress?.(event);
      }}
    />
  );
}
