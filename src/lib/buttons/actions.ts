import { getButtonPermissionSnapshot } from "../access/button-permissions";
import {
  canUseButton,
  isButtonSession,
  type ButtonSession,
} from "../access/use-button-permissions";
import {
  isButtonVisible,
  type ActionKind,
  type ButtonActionPayloads,
  type ButtonDefinition,
} from "./registry";

export type ButtonExecutionResult =
  | { readonly status: "executed" | "cancelled" }
  | {
      readonly status: "denied";
      readonly reason: "permission" | "session" | "context" | "unavailable";
    }
  | { readonly status: "failed"; readonly error: unknown };

export interface ButtonExecution<C> {
  readonly session: ButtonSession;
  readonly getContext: () => Readonly<C>;
  readonly isDisabled?: (context: Readonly<C>) => boolean;
}
export interface ActionExecution<C, K extends ActionKind> {
  readonly definition: ButtonDefinition<C>;
  readonly payload: ButtonActionPayloads[K];
  readonly getContext: () => Readonly<C>;
  readonly assertAllowed: () => boolean;
  /** Use immediately before the actual effect, including after an async wait. */
  readonly runAuthorized: (
    callback: (context: Readonly<C>) => void | Promise<void>,
  ) => Promise<ButtonExecutionResult>;
}
export type ActionExecutor<K extends ActionKind> = <C>(
  execution: ActionExecution<C, K>,
) => ButtonExecutionResult | Promise<ButtonExecutionResult>;

export class ButtonActions {
  private readonly executors = new Map<ActionKind, ActionExecutor<ActionKind>>();

  constructor() {
    this.registerActionKind("handler", ({ definition, runAuthorized }) => {
      if (!definition.handler) return { status: "denied", reason: "unavailable" };
      return runAuthorized(definition.handler);
    });
  }

  registerActionKind<K extends ActionKind>(kind: K, executor: ActionExecutor<K>): void {
    if (this.executors.has(kind)) throw new Error(`Duplicate action kind: ${kind}`);
    if (
      typeof kind !== "string" ||
      !kind.trim() ||
      kind.trim() !== kind ||
      typeof executor !== "function"
    )
      throw new Error("Invalid action executor");
    // The index retains the kind/payload relationship established at registration.
    this.executors.set(kind, executor as ActionExecutor<ActionKind>);
  }

  hasActionKind(kind: ActionKind): boolean {
    return this.executors.has(kind);
  }

  async executeButton<C>(
    definition: ButtonDefinition<C>,
    execution: ButtonExecution<C>,
  ): Promise<ButtonExecutionResult> {
    const kind = definition.action?.kind ?? "handler";
    const executor = this.executors.get(kind);
    if (!executor) return { status: "denied", reason: "unavailable" };
    const check = (): { status: "allowed"; context: Readonly<C> } | ButtonExecutionResult => {
      const snapshot = getButtonPermissionSnapshot();
      if (!isButtonSession(snapshot, execution.session))
        return { status: "denied", reason: "session" };
      if (!canUseButton(snapshot, definition.code))
        return { status: "denied", reason: "permission" };
      const context = execution.getContext();
      if (!isButtonVisible(definition, context) || execution.isDisabled?.(context))
        return { status: "denied", reason: "context" };
      return { status: "allowed", context };
    };
    try {
      const permission = check();
      if (permission.status !== "allowed") return permission;
      return await executor({
        definition,
        payload: definition.action?.payload,
        getContext: execution.getContext,
        assertAllowed: () => check().status === "allowed",
        runAuthorized: async (callback) => {
          try {
            const permission = check();
            if (permission.status !== "allowed") return permission;
            await callback(permission.context);
            return { status: "executed" };
          } catch (error) {
            return { status: "failed", error };
          }
        },
      });
    } catch (error) {
      return { status: "failed", error };
    }
  }
}

export const buttonActions = new ButtonActions();
