import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentPropsWithRef } from "react";
import { publishFixture } from "@/lib/buttons/__tests__/fixtures";
import { resetAccess } from "@/lib/access/store";
const captured = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("@heroui/react", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: Record<string, unknown>) => {
      captured.props = props;
      return createElement(
        "button",
        {
          disabled: props.isDisabled as boolean,
          type: props.type as "button",
          className: props.className as string,
        },
        props.children as string,
      );
    },
  };
});
import { PermButton, type PermButtonProps } from "../perm-button";
afterEach(() => resetAccess(null, 0));
const press = () => (captured.props.onPress as (event: unknown) => void)({});
it("idle/default hidden, fallback, disabled and presentation attributes", () => {
  resetAccess(null, 0);
  expect(renderToStaticMarkup(<PermButton code="fixture:create">Create</PermButton>)).toBe("");
  expect(
    renderToStaticMarkup(
      <PermButton code="fixture:create" fallback={<span>denied</span>}>
        Create
      </PermButton>,
    ),
  ).toBe("<span>denied</span>");
  expect(
    renderToStaticMarkup(
      <PermButton code="fixture:create" mode="disabled" fallback="ignored">
        Create
      </PermButton>,
    ),
  ).toContain('disabled=""');
  publishFixture();
  const ref = { current: null };
  renderToStaticMarkup(
    <PermButton
      code="fixture:create"
      variant="ghost"
      size="sm"
      className="fixture"
      aria-label="Create"
      ref={ref}
    >
      Create
    </PermButton>,
  );
  expect(captured.props).toMatchObject({
    type: "button",
    variant: "ghost",
    size: "sm",
    className: "fixture",
    "aria-label": "Create",
    ref,
  });
});
it("guarded entry re-reads real snapshots before a React commit", () => {
  publishFixture();
  const handler = vi.fn();
  renderToStaticMarkup(
    <PermButton code="fixture:create" onPress={handler}>
      Create
    </PermButton>,
  );
  press();
  expect(handler).toHaveBeenCalledOnce();
  publishFixture({ authorities: [] });
  press();
  publishFixture({ userId: "8" });
  press();
  publishFixture({ generation: 4 });
  press();
  expect(handler).toHaveBeenCalledOnce();
  publishFixture({ revision: 10 });
  press();
  expect(handler).toHaveBeenCalledTimes(2);
});
it("business disabled/pending and forbidden JS event props cannot bypass the entry", () => {
  publishFixture();
  const handler = vi.fn();
  const injected = {
    onClick: handler,
    onPressStart: handler,
    onPressEnd: handler,
    onKeyDown: handler,
  };
  renderToStaticMarkup(
    <PermButton {...injected} code="fixture:create" isDisabled onPress={handler}>
      Create
    </PermButton>,
  );
  press();
  for (const key of Object.keys(injected)) expect(captured.props).not.toHaveProperty(key);
  renderToStaticMarkup(
    <PermButton code="fixture:create" isPending onPress={handler}>
      Create
    </PermButton>,
  );
  press();
  publishFixture({ authorities: [] });
  renderToStaticMarkup(
    <PermButton code="fixture:create" mode="disabled" isDisabled={false} onPress={handler}>
      Create
    </PermButton>,
  );
  press();
  expect(captured.props.isDisabled).toBe(true);
  expect(handler).not.toHaveBeenCalled();
});

it("preserves explicit submit type and the single handler's native event", () => {
  publishFixture();
  const handler = vi.fn();
  renderToStaticMarkup(
    <PermButton code="fixture:create" type="submit" onPress={handler}>
      Create
    </PermButton>,
  );
  const event = { type: "press", pointerType: "keyboard" };
  (captured.props.onPress as (event: unknown) => void)(event);
  expect(captured.props.type).toBe("submit");
  expect(handler).toHaveBeenCalledExactlyOnceWith(event);
});
// Compile-time API: independent activation props are excluded.
const native: ComponentPropsWithRef<typeof PermButton> = {
  code: "fixture:create",
  onPress: () => {},
};
void native;
// @ts-expect-error onClick is not a permitted business event entry
const forbidden: PermButtonProps = { code: "fixture:create", onClick: () => {} };
void forbidden;
