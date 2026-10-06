import { expect, it, vi } from "vitest";
import { forwardRef, memo } from "react";
import { ButtonRegistry, isButtonVisible, type ButtonDefinition } from "../registry";
const definition = (code: string): ButtonDefinition<{ id: number }> => ({
  code,
  label: code,
  handler: vi.fn(),
});
it("domain handles, global lookup, append order and immutable queries", () => {
  const registry = new ButtonRegistry();
  const a = definition("fixture:a");
  const handle = registry.registerDomain("fixture", [a]);
  registry.registerDomain("fixture", [definition("fixture:b")]);
  expect(registry.getDomain(handle).map((d) => d.code)).toEqual(["fixture:a", "fixture:b"]);
  expect(registry.get("fixture:a")).not.toBe(a);
  expect(Object.isFrozen(registry.get("fixture:a"))).toBe(true);
  expect(() =>
    (registry.getDomain(handle) as ButtonDefinition<{ id: number }>[]).push(a),
  ).toThrow();
  expect(() => new ButtonRegistry().getDomain(handle)).toThrow();
  expect(registry.get("missing")).toBeUndefined();
});
it("same and cross domain duplicates reject atomically including an in-batch duplicate", () => {
  const registry = new ButtonRegistry();
  const handle = registry.registerDomain("fixture", [definition("fixture:a")]);
  for (const domain of ["fixture", "another"]) {
    expect(() =>
      registry.registerDomain(domain, [definition("fixture:b"), definition("fixture:a")]),
    ).toThrow("Duplicate");
    expect(registry.get("fixture:b")).toBeUndefined();
  }
  expect(() =>
    registry.registerDomain("fixture", [definition("fixture:c"), definition("fixture:c")]),
  ).toThrow();
  expect(registry.getDomain(handle)).toHaveLength(1);
});
it("rejects invalid configuration without retaining partial batches", () => {
  const registry = new ButtonRegistry();
  for (const invalid of [
    { code: "" },
    { code: " fixture:x" },
    { label: " " },
    { handler: undefined },
    { visible: true },
    { icon: {} },
    { icon: "remote-icon-name" },
    { icon: null },
    { action: { kind: "confirm", payload: { message: "?" } } },
  ]) {
    expect(() =>
      registry.registerDomain("fixture", [
        definition("fixture:good"),
        { ...definition("fixture:bad"), ...invalid } as ButtonDefinition<{ id: number }>,
      ]),
    ).toThrow();
    expect(registry.get("fixture:good")).toBeUndefined();
  }
});

it("accepts trusted function, forwardRef and memo icon component types", () => {
  const registry = new ButtonRegistry();
  const Icon = () => null;
  const icons = [
    Icon,
    forwardRef<SVGSVGElement, { size?: number; "aria-hidden"?: boolean }>(() => null),
    memo(Icon),
  ];
  const handle = registry.registerDomain(
    "fixture-icons",
    icons.map((icon, index) => ({
      ...definition(`fixture:icon-${index}`),
      icon,
    })),
  );
  expect(registry.getDomain(handle).map((item) => item.icon)).toEqual(icons);
});
it("visible is synchronous, fails closed and re-evaluates for each row", () => {
  const base = definition("fixture:a");
  expect(isButtonVisible(base, { id: 1 })).toBe(true);
  const conditional = { ...base, visible: ({ id }: { id: number }) => id === 2 };
  expect(isButtonVisible(conditional, { id: 1 })).toBe(false);
  expect(isButtonVisible(conditional, { id: 2 })).toBe(true);
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(
    isButtonVisible(
      {
        ...base,
        visible: () => {
          throw Error("configuration");
        },
      },
      { id: 1 },
    ),
  ).toBe(false);
  expect(
    isButtonVisible({ ...base, visible: (() => Promise.resolve(true)) as never }, { id: 1 }),
  ).toBe(false);
  expect(report).toHaveBeenCalledTimes(2);
  report.mockRestore();
});

it("copies and freezes action payloads without mutating the supplied definition", () => {
  const registry = new ButtonRegistry();
  const payload = { value: 42 };
  registry.registerDomain("fixture", [
    { code: "fixture:x", label: "fixture", action: { kind: "fixture-kind", payload } },
  ]);
  payload.value = 99;
  expect(registry.get("fixture:x")?.action?.payload).toEqual({ value: 42 });
  expect(Object.isFrozen(registry.get("fixture:x")?.action)).toBe(true);
  expect(Object.isFrozen(registry.get("fixture:x")?.action?.payload)).toBe(true);
  expect(Object.isFrozen(payload)).toBe(false);
});
