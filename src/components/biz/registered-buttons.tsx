import { useLayoutEffect, useRef } from "react";
import { PermButton, type PermButtonProps } from "./perm-button";
import { useButtonPermissions } from "@/lib/access/use-button-permissions";
import { buttonActions, type ButtonActions } from "@/lib/buttons/actions";
import { isButtonVisible, type DomainHandle } from "@/lib/buttons/registry";

type Presentation = Pick<
  PermButtonProps,
  "mode" | "variant" | "size" | "className" | "isDisabled" | "isPending"
>;
export interface RegisteredButtonsProps<C> extends Presentation {
  domain: DomainHandle<C>;
  context: Readonly<C>;
  actions?: ButtonActions;
  isContextDisabled?: (context: Readonly<C>) => boolean;
  /** Required to route asynchronous executor/handler errors to the page's error UI. */
  onActionError: (error: unknown) => void;
}

export function RegisteredButtons<C>({
  domain,
  context,
  actions = buttonActions,
  isContextDisabled,
  onActionError,
  ...presentation
}: RegisteredButtonsProps<C>) {
  const session = useButtonPermissions();
  const latest = useRef({ context, presentation, isContextDisabled, onActionError });
  const mounted = useRef(false);
  useLayoutEffect(() => {
    latest.current = { context, presentation, isContextDisabled, onActionError };
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  });
  return (
    <>
      {domain.registry.getDomain(domain).map((definition) => {
        if (!isButtonVisible(definition, context)) return null;
        const available = actions.hasActionKind(definition.action?.kind ?? "handler");
        if (!available && presentation.mode !== "disabled") return null;
        const Icon = definition.icon;
        return (
          <PermButton
            {...presentation}
            key={definition.code}
            code={definition.code}
            isDisabled={presentation.isDisabled || !available || isContextDisabled?.(context)}
            onPress={() => {
              void actions
                .executeButton(definition, {
                  session,
                  getContext: () => latest.current.context,
                  isDisabled: (current) =>
                    !mounted.current ||
                    Boolean(
                      latest.current.presentation.isDisabled ||
                      latest.current.presentation.isPending ||
                      latest.current.isContextDisabled?.(current),
                    ),
                })
                .then((result) => {
                  if (result.status === "failed") latest.current.onActionError(result.error);
                })
                .catch((error: unknown) => {
                  // Includes an error reporter throwing: prevent an unhandled rejection.
                  console.error("Button action error reporter failed", error);
                });
            }}
          >
            {Icon ? <Icon size={16} aria-hidden /> : null}
            {definition.label}
          </PermButton>
        );
      })}
    </>
  );
}
