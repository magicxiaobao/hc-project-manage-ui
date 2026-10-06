import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { DictionaryHookHarness as H, nodes, button, deferred } from "./dictionary-hook-harness";
import { useAuthStore, getSessionGeneration } from "@/lib/api/auth-store";
import { WorkflowDesignerSession } from "../workflow-designer/workflow-designer-page";
import { WorkflowStatePanel } from "../workflow-designer/workflow-state-panel";
import { WorkflowToolbar } from "../workflow-designer/workflow-toolbar";
import { WorkflowCanvas } from "../workflow-designer/workflow-canvas";
import { WorkflowPropertyPanel } from "../workflow-designer/workflow-property-panel";
import { AppModal } from "@/components/biz/app-modal";
import { readGraphFile, storageKey, serializeGraph } from "@/lib/workflow-designer-storage";
import { emptyGraph, type WorkflowGraph, type Result } from "@/lib/workflow-designer";
const mocks = vi.hoisted(() => ({ dirty: false, download: vi.fn(), read: vi.fn() }));
vi.mock("react", async (load) => {
  const real = await load<typeof import("react")>();
  return {
    ...real,
    useState: ((v: unknown) =>
      H.active ? H.active.state(v) : real.useState(v)) as typeof real.useState,
    useRef: ((v: unknown) => (H.active ? H.active.ref(v) : real.useRef(v))) as typeof real.useRef,
    useEffect: ((fn, deps) =>
      H.active ? H.active.effect(fn, deps) : real.useEffect(fn, deps)) as typeof real.useEffect,
    useReducer: ((
      reducer: (state: unknown, action: unknown) => unknown,
      arg: unknown,
      init?: (arg: unknown) => unknown,
    ) => {
      if (!H.active) return real.useReducer(reducer, arg, init!);
      const [state, set] = H.active.state(() => (init ? init(arg) : arg));
      return [state, (action: unknown) => set((previous: unknown) => reducer(previous, action))];
    }) as typeof real.useReducer,
  };
});
vi.mock("@/components/biz/form-guard", async (load) => ({
  ...(await load<typeof import("@/components/biz/form-guard")>()),
  useUnsavedChangesGuard: (dirty: boolean) => {
    mocks.dirty = dirty;
    return { blocker: null, dialog: null };
  },
}));
vi.mock("@/lib/workflow-designer-storage", async (load) => ({
  ...(await load<typeof import("@/lib/workflow-designer-storage")>()),
  downloadGraph: (g: WorkflowGraph) => mocks.download(g),
  readGraphFile: (file: File) => mocks.read(file),
}));
let harness: H;
let data: Map<string, string>;
let failSave: boolean;
let writes: number;
const original = useAuthStore.getState();
const component = <P,>(type: unknown): P =>
  nodes(harness.tree).find((n) => n.type === type)!.props as P;
const statePanel = () => component<Parameters<typeof WorkflowStatePanel>[0]>(WorkflowStatePanel);
const toolbar = () => component<Parameters<typeof WorkflowToolbar>[0]>(WorkflowToolbar);
const properties = () =>
  component<Parameters<typeof WorkflowPropertyPanel>[0]>(WorkflowPropertyPanel);
const canvas = () => component<Parameters<typeof WorkflowCanvas>[0]>(WorkflowCanvas);
const render = () => harness.render();
const act = (fn: () => void) => {
  fn();
  render();
};
const confirm = () => act(button(harness.tree, "确定").onPress);
const cancel = () => act(component<Parameters<typeof AppModal>[0]>(AppModal).onClose);
const add = () => act(statePanel().onAdd);
const edit = (k: string, v: string) => act(() => properties().onChange(k, v));
const model = () => statePanel().graph;
const user = (userId = "1") => ({
  userId,
  userName: "fixture",
  cnName: null,
  extraInfo: {},
  roles: [],
  authorities: ["system:admin"],
});
function mount() {
  harness = new H();
  harness.render(() =>
    WorkflowDesignerSession({ userId: "1", generation: getSessionGeneration() }),
  );
}
beforeEach(() => {
  data = new Map();
  writes = 0;
  failSave = false;
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failSave) throw Error("quota");
      writes++;
      data.set(k, v);
    },
  });
  vi.stubGlobal("document", { getElementById: () => ({ focus: vi.fn() }) });
  useAuthStore.setState({ isAuthenticated: true, user: user() });
  mocks.download.mockImplementation((g: WorkflowGraph) => ({ ok: true, value: g }));
  mocks.read.mockReset();
  mount();
});
afterEach(() => {
  harness.unmount();
  useAuthStore.setState(original);
  vi.unstubAllGlobals();
});
it("field collection, editing clears only its error, valid apply, draft-only dirty and revert", () => {
  add();
  act(toolbar().persistence!.onSave);
  expect(mocks.dirty).toBe(false);
  edit("label", "");
  edit("x", "");
  edit("y", "Infinity");
  expect(mocks.dirty).toBe(true);
  act(properties().onApply);
  expect(properties().errors.map((e) => e.field)).toEqual(["label", "x", "y"]);
  expect(model().nodes[0].label).toBe("状态 1");
  edit("label", "新名称");
  expect(properties().errors.map((e) => e.field)).toEqual(["x", "y"]);
  edit("x", "-100");
  edit("y", "80");
  act(properties().onApply);
  expect(model().nodes[0]).toMatchObject({ label: "新名称", position: { x: -100, y: 80 } });
  expect(mocks.dirty).toBe(true);
  act(toolbar().persistence!.onSave);
  expect(mocks.dirty).toBe(false);
  edit("label", "changed");
  edit("label", "新名称");
  expect(mocks.dirty).toBe(false);
});
it("selection/cancel confirmation does not release page protection or overwrite new coordinates", () => {
  add();
  add();
  const [a, b] = model().nodes;
  edit("description", "draft");
  act(() => statePanel().onSelect(a.id));
  cancel();
  expect(properties().draft?.id).toBe(b.id);
  expect(properties().draft?.values.description).toBe("draft");
  act(() => canvas().onMove?.(b.id, { x: 88, y: 44 }));
  expect(properties().draft?.values.x).toBe("88");
  act(properties().onApply);
  expect(model().nodes[1]).toMatchObject({ description: "draft", position: { x: 88, y: 44 } });
  edit("description", "abandoned");
  act(() => statePanel().onSelect(a.id));
  confirm();
  expect(properties().draft?.id).toBe(a.id);
  expect(model().nodes[1].description).toBe("draft");
  expect(mocks.dirty).toBe(true);
  edit("label", "cancel draft");
  act(properties().onCancel);
  cancel();
  expect(properties().draft?.values.label).toBe("cancel draft");
  act(properties().onCancel);
  confirm();
  expect(properties().draft?.values.label).toBe(a.label);
});
it("connect constraints, deletion cascade and clear cancellations are atomic", () => {
  add();
  add();
  const [a, b] = model().nodes;
  act(() => toolbar().onTool("connect"));
  act(() => statePanel().onSelect(a.id));
  act(() => statePanel().onSelect(a.id));
  expect(model().edges).toHaveLength(0);
  act(() => statePanel().onSelect(b.id));
  expect(model().edges).toHaveLength(1);
  act(() => toolbar().onTool("connect"));
  act(() => statePanel().onSelect(a.id));
  act(() => statePanel().onSelect(b.id));
  expect(model().edges).toHaveLength(1);
  act(() => toolbar().onTool("select"));
  act(() => statePanel().onSelect(a.id));
  act(toolbar().onDelete);
  cancel();
  expect(model().nodes).toHaveLength(2);
  act(toolbar().onDelete);
  confirm();
  expect(model().nodes).toHaveLength(1);
  expect(model().edges).toHaveLength(0);
  act(toolbar().onClear);
  cancel();
  expect(model().nodes).toHaveLength(1);
  act(toolbar().onClear);
  confirm();
  expect(model()).toEqual(emptyGraph());
});
it("save/download failure retains graph/draft/baseline, success clears only intended layers", () => {
  add();
  act(toolbar().persistence!.onSave);
  const saved = data.get(storageKey("1")!);
  edit("label", "pending");
  failSave = true;
  act(toolbar().persistence!.onSave);
  expect(model().nodes[0].label).toBe("状态 1");
  expect(properties().draft?.values.label).toBe("pending");
  expect(data.get(storageKey("1")!)).toBe(saved);
  expect(mocks.dirty).toBe(true);
  mocks.download.mockReturnValueOnce({ ok: false, errors: [{ field: "file", message: "failed" }] });
  act(toolbar().persistence!.onExport);
  expect(model().nodes[0].label).toBe("状态 1");
  act(toolbar().persistence!.onExport);
  expect(model().nodes[0].label).toBe("pending");
  expect(mocks.dirty).toBe(true);
  expect(data.get(storageKey("1")!)).toBe(saved);
  failSave = false;
  act(toolbar().persistence!.onSave);
  expect(mocks.dirty).toBe(false);
  edit("description", "again");
  expect(mocks.dirty).toBe(true);
});
it("overwrite prompt only for bad/unreadable records; cancellation preserves raw record and draft", () => {
  harness.unmount();
  data.set(storageKey("1")!, "broken");
  mount();
  expect(model()).toEqual(emptyGraph());
  expect(mocks.dirty).toBe(false);
  add();
  edit("label", "candidate");
  act(toolbar().persistence!.onSave);
  cancel();
  expect(data.get(storageKey("1")!)).toBe("broken");
  expect(writes).toBe(0);
  expect(properties().draft?.values.label).toBe("candidate");
  act(toolbar().persistence!.onSave);
  confirm();
  expect(model().nodes[0].label).toBe("candidate");
  expect(mocks.dirty).toBe(false);
  edit("description", "next");
  act(toolbar().persistence!.onSave);
  expect(component<Parameters<typeof AppModal>[0]>(AppModal).open).toBe(false);
});
it("imports lock editor; invalid/canceled/repeated/stale reads preserve graph, selection and storage", async () => {
  add();
  edit("label", "draft");
  const before = structuredClone(model()),
    selected = properties().draft?.id;
  const input = () =>
    nodes(harness.tree).find((n) => n.type === "input" && n.props.type === "file")!.props;
  const start = () => {
    (input().onChange as (e: unknown) => void)({ target: { files: [{}], value: "file" } });
    render();
  };
  mocks.read.mockResolvedValueOnce({ ok: false, errors: [{ field: "file", message: "bad" }] });
  start();
  await Promise.resolve();
  render();
  expect(model()).toEqual(before);
  expect(properties().draft?.id).toBe(selected);
  expect(properties().draft?.values.label).toBe("draft");
  mocks.read.mockResolvedValue({ ok: true, value: emptyGraph() });
  start();
  await Promise.resolve();
  render();
  cancel();
  expect(model()).toEqual(before);
  start();
  await Promise.resolve();
  render();
  confirm();
  expect(model()).toEqual(emptyGraph());
  expect(properties().draft).toBeNull();
  expect(writes).toBe(0);
  const delay = deferred<Result<WorkflowGraph>>();
  mocks.read.mockReturnValue(delay.promise);
  start();
  expect(toolbar().disabled).toBe(true);
  act(toolbar().persistence!.onCancelImport);
  add();
  const afterCancel = structuredClone(model());
  delay.resolve({ ok: true, value: emptyGraph() });
  await Promise.resolve();
  render();
  expect(model()).toEqual(afterCancel);
  const stale = deferred<Result<WorkflowGraph>>();
  mocks.read.mockReturnValue(stale.promise);
  start();
  useAuthStore.setState({ user: user("2") });
  stale.resolve({ ok: true, value: emptyGraph() });
  await Promise.resolve();
  render();
  expect(model()).toEqual(afterCancel);
  expect(writes).toBe(0);
  act(toolbar().persistence!.onSave);
  expect(writes).toBe(0);
});

it("view/tools/selection remain clean; node preview guards before commit, pan preview does not dirty", () => {
  add();
  act(toolbar().persistence!.onSave);
  const n = model().nodes[0];
  expect(mocks.dirty).toBe(false);
  act(() => toolbar().onZoom(0.1));
  act(() => toolbar().onTool("pan"));
  act(() => canvas().onInteraction?.(true, false));
  expect(mocks.dirty).toBe(false);
  expect(toolbar().disabled).toBe(true);
  act(() => canvas().onInteraction?.(false, false));
  act(() => toolbar().onTool("select"));
  act(() => statePanel().onSelect(n.id));
  expect(canvas().view.x).not.toBe(0);
  expect(mocks.dirty).toBe(false);
  act(() => canvas().onInteraction?.(true, true));
  expect(mocks.dirty).toBe(true);
  act(() => canvas().onMove?.(n.id, n.position));
  act(() => canvas().onInteraction?.(false, false));
  expect(mocks.dirty).toBe(false);
  act(() => toolbar().onTool("connect"));
  expect(mocks.dirty).toBe(false);
});
