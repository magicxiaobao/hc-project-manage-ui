import type {
  ReactElement,
  ReactNode,
  DependencyList,
  EffectCallback,
  Dispatch,
  SetStateAction,
} from "react";
/** Controlled node-only hook/callback harness. This does not simulate a browser or DOM. */
export class DictionaryHookHarness {
  private slots: Array<{ value?: unknown; deps?: DependencyList; cleanup?: void | (() => void) }> =
    [];
  private index = 0;
  private effects: Array<() => void> = [];
  private changed = false;
  private component!: () => ReactElement;
  tree!: ReactElement;
  static active: DictionaryHookHarness | null = null;
  state<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
    const position = this.index++;
    if (!this.slots[position])
      this.slots[position] = {
        value: typeof initial === "function" ? (initial as () => T)() : initial,
      };
    return [
      this.slots[position].value as T,
      (action) => {
        const previous = this.slots[position].value as T;
        const next = typeof action === "function" ? (action as (p: T) => T)(previous) : action;
        if (!Object.is(previous, next)) {
          this.slots[position].value = next;
          this.changed = true;
        }
      },
    ];
  }
  ref<T>(initial: T) {
    return this.state(() => ({ current: initial }))[0];
  }
  effect(callback: EffectCallback, deps?: DependencyList) {
    const position = this.index++;
    const previous = this.slots[position];
    if (
      !previous ||
      !deps ||
      !previous.deps ||
      deps.some((v, i) => !Object.is(v, previous.deps![i]))
    ) {
      this.slots[position] = { deps, cleanup: previous?.cleanup };
      this.effects.push(() => {
        previous?.cleanup?.();
        this.slots[position].cleanup = callback();
      });
    }
  }
  render(component?: () => ReactElement) {
    if (component) this.component = component;
    let passes = 0;
    do {
      this.changed = false;
      this.index = 0;
      DictionaryHookHarness.active = this;
      try {
        this.tree = this.component();
      } finally {
        DictionaryHookHarness.active = null;
      }
      this.effects.splice(0).forEach((effect) => effect());
      if (++passes > 15) throw new Error("Unstable test render");
    } while (this.changed);
    return this.tree;
  }
  unmount() {
    this.slots.forEach((slot) => slot.cleanup?.());
  }
}
export function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}
export const textOf = (node: ReactNode): string => {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
};
export function button(tree: ReactNode, label: string) {
  const found = nodes(tree).find(
    (node) =>
      typeof node.props.onPress === "function" &&
      textOf(node.props.children as ReactNode) === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found.props as { onPress: () => void; isDisabled?: boolean };
}
export function change(tree: ReactNode, label: string, value: string) {
  const found = nodes(tree).find(
    (node) => node.props["aria-label"] === label && typeof node.props.onChange === "function",
  );
  if (!found) throw new Error(`Missing input: ${label}`);
  (found.props.onChange as (value: string) => void)(value);
}
export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
