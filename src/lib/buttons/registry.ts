import type { ComponentType } from "react";

/** Declaration merging adds a kind and its payload without changing the renderer. */
export interface ButtonActionPayloads {
  handler: undefined;
  confirm: { readonly message: string };
  batch: { readonly scope: string };
  "external-link": { readonly url: string };
}
export type ActionKind = keyof ButtonActionPayloads;
export type ButtonHandler<C> = (context: Readonly<C>) => void | Promise<void>;
type BaseDefinition<C> = {
  readonly code: string;
  readonly label: string;
  readonly icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  readonly visible?: (context: Readonly<C>) => boolean;
};
export type ButtonAction<K extends ActionKind = ActionKind> = {
  [P in K]: { readonly kind: P; readonly payload: ButtonActionPayloads[P] };
}[K];
export type ButtonDefinition<C> = BaseDefinition<C> &
  (
    | {
        readonly handler: ButtonHandler<C>;
        readonly action?: { readonly kind: "handler"; readonly payload?: undefined };
      }
    | { readonly handler?: never; readonly action: ButtonAction<Exclude<ActionKind, "handler">> }
  );
export interface DomainHandle<C> {
  readonly domain: string;
  readonly registry: ButtonRegistry;
  /** Type-only context marker. */
  readonly contextType?: (context: C) => C;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function validIcon(value: unknown): boolean {
  return (
    typeof value === "function" ||
    (value !== null &&
      typeof value === "object" &&
      "$$typeof" in value &&
      (value.$$typeof === Symbol.for("react.forward_ref") ||
        value.$$typeof === Symbol.for("react.memo")))
  );
}

/** Copy configuration payloads so a caller cannot mutate a registered definition. */
function copyPayload(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(copyPayload));
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyPayload(item)])),
    );
  }
  return value;
}

export function isButtonVisible<C>(definition: ButtonDefinition<C>, context: Readonly<C>): boolean {
  try {
    const result = definition.visible ? definition.visible(context) : true;
    if (typeof result !== "boolean") throw new Error("visible must return a boolean synchronously");
    return result;
  } catch (error) {
    console.error(`Button configuration error (${definition.code}): visible`, error);
    return false;
  }
}

/** UI configuration only. Registration never reads or writes authorization facts. */
export class ButtonRegistry {
  private readonly codes = new Map<string, ButtonDefinition<never>>();
  private readonly domains = new Map<string, readonly ButtonDefinition<never>[]>();

  registerDomain<C>(domain: string, definitions: readonly ButtonDefinition<C>[]): DomainHandle<C> {
    if (!validText(domain)) throw new Error("Invalid button domain");
    const batch = new Set<string>();
    for (const definition of definitions) {
      if (!validText(definition.code) || !validText(definition.label))
        throw new Error("Invalid button code/label");
      if (this.codes.has(definition.code) || batch.has(definition.code))
        throw new Error(`Duplicate button code: ${definition.code}`);
      if (definition.visible !== undefined && typeof definition.visible !== "function")
        throw new Error("Invalid visible condition");
      if (definition.icon !== undefined && !validIcon(definition.icon))
        throw new Error("Invalid button icon");
      if (
        definition.action !== undefined &&
        (!definition.action || !validText(definition.action.kind))
      )
        throw new Error("Invalid button action");
      const kind = definition.action?.kind ?? "handler";
      if (!validText(kind)) throw new Error("Invalid action kind");
      if (
        kind === "handler"
          ? typeof definition.handler !== "function" || definition.action?.payload !== undefined
          : definition.handler !== undefined ||
            !definition.action ||
            !("payload" in definition.action)
      )
        throw new Error("Ambiguous or missing button handler/action");
      batch.add(definition.code);
    }
    // Validate the entire batch before mutating either index.
    const additions = definitions.map(
      (definition) =>
        Object.freeze({
          ...definition,
          ...(definition.action
            ? {
                action: Object.freeze({
                  ...definition.action,
                  payload: copyPayload(definition.action.payload),
                }),
              }
            : {}),
        }) as ButtonDefinition<never>,
    );
    for (const definition of additions) this.codes.set(definition.code, definition);
    this.domains.set(domain, Object.freeze([...(this.domains.get(domain) ?? []), ...additions]));
    return Object.freeze({ domain, registry: this });
  }

  getDomain<C>(handle: DomainHandle<C>): readonly ButtonDefinition<C>[] {
    if (handle.registry !== this) throw new Error("Button domain belongs to another registry");
    return (this.domains.get(handle.domain) ?? Object.freeze([])) as readonly ButtonDefinition<C>[];
  }

  get(code: string): ButtonDefinition<never> | undefined {
    return this.codes.get(code);
  }
}

export const buttonRegistry = new ButtonRegistry();
