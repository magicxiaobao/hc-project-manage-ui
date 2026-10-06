import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RegisteredButtons } from "../registered-buttons";
import { ButtonRegistry } from "@/lib/buttons/registry";
import { ButtonActions } from "@/lib/buttons/actions";
import { publishFixture } from "@/lib/buttons/__tests__/fixtures";
import { resetAccess } from "@/lib/access/store";
import { getButtonPermissionSnapshot } from "@/lib/access/button-permissions";
import { roleButtons } from "@/lib/buttons/domains/roles";
afterEach(() => resetAccess(null, 0));
it("append a second definition to the installed domain without changing the renderer", () => {
  publishFixture();
  const registry = new ButtonRegistry();
  const domain = registry.registerDomain<{ visible: boolean }>("fixture", [
    { code: "fixture:create", label: "Create", handler: vi.fn() },
  ]);
  const render = () =>
    renderToStaticMarkup(
      <RegisteredButtons domain={domain} context={{ visible: true }} onActionError={vi.fn()} />,
    );
  expect(render()).toContain("Create");
  expect(render()).not.toContain("Edit");
  registry.registerDomain<{ visible: boolean }>("fixture", [
    { code: "fixture:edit", label: "Edit", visible: (c) => c.visible, handler: vi.fn() },
  ]);
  expect(render()).toContain("Edit");
  expect(
    renderToStaticMarkup(
      <RegisteredButtons domain={domain} context={{ visible: false }} onActionError={vi.fn()} />,
    ),
  ).not.toContain("Edit");
  publishFixture({ authorities: [] });
  expect(render()).toBe("");
});
it("missing executor follows hidden/disabled mode, never renders an enabled action", () => {
  publishFixture();
  const registry = new ButtonRegistry();
  const domain = registry.registerDomain("another-fixture", [
    {
      code: "fixture:create",
      label: "Wait",
      action: { kind: "confirm", payload: { message: "?" } },
    },
  ]);
  const actions = new ButtonActions();
  expect(
    renderToStaticMarkup(
      <RegisteredButtons domain={domain} context={{}} actions={actions} onActionError={vi.fn()} />,
    ),
  ).toBe("");
  const disabled = renderToStaticMarkup(
    <RegisteredButtons
      domain={domain}
      context={{}}
      mode="disabled"
      actions={actions}
      onActionError={vi.fn()}
    />,
  );
  expect(disabled).toContain('disabled=""');
  expect(disabled).toContain("Wait");
});
it("role definitions choose existing page callbacks and row IDs without registering per row", async () => {
  publishFixture({ codes: ["role:create", "role:edit"] });
  const create = vi.fn(),
    edit = vi.fn();
  const context = {
    placement: "toolbar" as const,
    row: null,
    disabled: false,
    openCreate: create,
    openEdit: edit,
  };
  const definitions = roleButtons.registry.getDomain(roleButtons);
  const render = renderToStaticMarkup(
    <RegisteredButtons domain={roleButtons} context={context} onActionError={vi.fn()} />,
  );
  expect(render).toContain("新增角色");
  expect(render).not.toContain("编辑");
  await definitions[0].handler?.(context);
  await definitions[1].handler?.({ ...context, placement: "row", row: { id: 42 } });
  expect(create).toHaveBeenCalledOnce();
  expect(edit).toHaveBeenCalledExactlyOnceWith(42);
  expect(definitions).toHaveLength(2);
});

it("registration, multiple rows and prop changes neither grant permissions nor request data", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  try {
    publishFixture({ authorities: [] });
    const before = getButtonPermissionSnapshot();
    const registry = new ButtonRegistry();
    const domain = registry.registerDomain<{ id: number }>("fixture-rows", [
      { code: "fixture:create", label: "Row action", handler: vi.fn() },
    ]);
    const render = (id: number) =>
      renderToStaticMarkup(
        <RegisteredButtons domain={domain} context={{ id }} onActionError={vi.fn()} />,
      );
    expect(render(1)).toBe("");
    expect(render(2)).toBe("");
    expect(getButtonPermissionSnapshot()).toBe(before);
    publishFixture();
    expect(render(1)).toContain("Row action");
    expect(render(2)).toContain("Row action");
    expect(registry.getDomain(domain)).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
