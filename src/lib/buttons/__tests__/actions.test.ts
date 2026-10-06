import { afterEach, expect, it, vi } from "vitest";
import { ButtonActions, type ButtonExecution } from "../actions";
import type { ButtonDefinition } from "../registry";
import { getButtonPermissionSnapshot } from "../../access/button-permissions";
import { resetAccess } from "../../access/store";
import { publishFixture } from "./fixtures";
interface Context {
  id: number;
  visible: boolean;
  disabled: boolean;
}
function setup() {
  publishFixture();
  const actions = new ButtonActions();
  let context = { id: 1, visible: true, disabled: false };
  const handler = vi.fn();
  const definition: ButtonDefinition<Context> = {
    code: "fixture:create",
    label: "fixture",
    handler,
    visible: (c) => c.visible,
  };
  const execution: ButtonExecution<Context> = {
    session: getButtonPermissionSnapshot(),
    getContext: () => context,
    isDisabled: (c) => c.disabled,
  };
  return {
    actions,
    handler,
    definition,
    execution,
    update: (next: Context) => {
      context = next;
    },
  };
}
afterEach(() => resetAccess(null, 0));
it("sync/async handlers each execute once; errors are explicit failed results", async () => {
  const { actions, definition, execution, handler } = setup();
  expect(await actions.executeButton(definition, execution)).toEqual({ status: "executed" });
  expect(handler).toHaveBeenCalledOnce();
  const asyncHandler = vi.fn(async () => {});
  await actions.executeButton({ ...definition, handler: asyncHandler }, execution);
  expect(asyncHandler).toHaveBeenCalledOnce();
  const error = Error("business failure");
  expect(
    await actions.executeButton(
      {
        ...definition,
        handler: async () => {
          throw error;
        },
      },
      execution,
    ),
  ).toEqual({ status: "failed", error });
});
it("unknown executors never fall back; duplicate kinds cannot replace handler", async () => {
  const { actions, definition, execution, handler } = setup();
  const confirm = {
    code: definition.code,
    label: "confirm",
    action: { kind: "confirm" as const, payload: { message: "?" } },
  };
  expect(await actions.executeButton(confirm, execution)).toEqual({
    status: "denied",
    reason: "unavailable",
  });
  expect(handler).not.toHaveBeenCalled();
  expect(() => actions.registerActionKind("handler", () => ({ status: "cancelled" }))).toThrow(
    "Duplicate",
  );
  actions.registerActionKind("confirm", () => ({ status: "cancelled" }));
  expect(await actions.executeButton(confirm, execution)).toEqual({ status: "cancelled" });
  expect(() => actions.registerActionKind("confirm", () => ({ status: "cancelled" }))).toThrow(
    "Duplicate",
  );
});
it.each(["permission", "logout", "user", "generation", "visible", "disabled"])(
  "delayed extension rechecks %s before effects",
  async (change) => {
    const { actions, execution, update } = setup();
    let resume!: () => void;
    const wait = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const effect = vi.fn();
    actions.registerActionKind("confirm", async ({ runAuthorized, assertAllowed }) => {
      expect(assertAllowed()).toBe(true);
      await wait;
      return runAuthorized(effect);
    });
    const pending = actions.executeButton(
      {
        code: "fixture:create",
        label: "fixture",
        action: { kind: "confirm", payload: { message: "?" } },
        visible: (c: Readonly<Context>) => c.visible,
      },
      execution,
    );
    if (change === "permission") publishFixture({ authorities: [] });
    if (change === "logout") resetAccess(null, 4);
    if (change === "user") publishFixture({ userId: "8" });
    if (change === "generation") publishFixture({ generation: 4 });
    if (change === "visible") update({ id: 2, visible: false, disabled: false });
    if (change === "disabled") update({ id: 2, visible: true, disabled: true });
    resume();
    expect((await pending).status).toBe("denied");
    expect(effect).not.toHaveBeenCalled();
  },
);
it("same session new revision and latest context remain usable", async () => {
  const { actions, execution, update } = setup();
  let resume!: () => void;
  const wait = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const effect = vi.fn();
  actions.registerActionKind("batch", async ({ runAuthorized }) => {
    await wait;
    return runAuthorized(effect);
  });
  const pending = actions.executeButton(
    {
      code: "fixture:create",
      label: "fixture",
      action: { kind: "batch", payload: { scope: "fixture" } },
    },
    execution,
  );
  update({ id: 2, visible: true, disabled: false });
  publishFixture({ revision: 10 });
  resume();
  expect((await pending).status).toBe("executed");
  expect(effect).toHaveBeenCalledWith({ id: 2, visible: true, disabled: false });
});
it("throwing/rejected executors return failures and preserve cancellation", async () => {
  const { actions, execution } = setup();
  const error = Error("executor");
  actions.registerActionKind("confirm", async () => {
    throw error;
  });
  expect(
    await actions.executeButton(
      {
        code: "fixture:create",
        label: "fixture",
        action: { kind: "confirm", payload: { message: "?" } },
      },
      execution,
    ),
  ).toEqual({ status: "failed", error });
});

it("synchronous handler and context reader failures are returned to the caller", async () => {
  const { actions, definition, execution } = setup();
  const error = Error("sync business failure");
  expect(
    await actions.executeButton(
      {
        ...definition,
        handler: () => {
          throw error;
        },
      },
      execution,
    ),
  ).toEqual({ status: "failed", error });
  expect(
    await actions.executeButton(definition, {
      ...execution,
      getContext: () => {
        throw error;
      },
    }),
  ).toEqual({ status: "failed", error });
});

declare module "../registry" {
  interface ButtonActionPayloads {
    "fixture-kind": { readonly value: number };
  }
}
it("a fixture-only new kind extends the type map and executor index without dispatcher changes", async () => {
  const { actions, execution } = setup();
  const effect = vi.fn();
  actions.registerActionKind("fixture-kind", ({ payload, runAuthorized }) =>
    runAuthorized(() => {
      effect(payload.value);
    }),
  );
  const result = await actions.executeButton(
    {
      code: "fixture:create",
      label: "fixture kind",
      action: { kind: "fixture-kind", payload: { value: 42 } },
    },
    execution,
  );
  expect(result).toEqual({ status: "executed" });
  expect(effect).toHaveBeenCalledExactlyOnceWith(42);
});
