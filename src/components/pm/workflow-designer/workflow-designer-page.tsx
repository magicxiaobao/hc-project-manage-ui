import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { useUnsavedChangesGuard } from "@/components/biz/form-guard";
import { AppModal } from "@/components/biz/app-modal";
import { getSessionGeneration, useAuthStore } from "@/lib/api/auth-store";
import {
  emptyGraph,
  updateGraph,
  makeDraft,
  applyDraft,
  draftDirty,
  graphEqual,
  validateGraph,
  syncDraftPosition,
  type PropertyDraft,
  type WorkflowError,
  type GraphAction,
  type WorkflowGraph,
} from "@/lib/workflow-designer";
import {
  restoreGraph,
  saveGraph,
  readGraphFile,
  downloadGraph,
  storageKey,
} from "@/lib/workflow-designer-storage";
import { WorkflowCanvas, fitView, initialView, type Tool } from "./workflow-canvas";
import { WorkflowPropertyPanel, fieldId } from "./workflow-property-panel";
import { WorkflowToolbar } from "./workflow-toolbar";
import { WorkflowStatePanel } from "./workflow-state-panel";
const messages = (errors: WorkflowError[]) =>
  errors.map((e) => `${e.field}：${e.message}`).join("\n");
export function WorkflowDesignerPage() {
  const userId = useAuthStore((s) => (s.isAuthenticated ? (s.user?.userId ?? null) : null));
  const generation = getSessionGeneration();
  // Remount the whole editing session on account/logout changes, invalidating pending reads.
  return (
    <WorkflowDesignerSession
      key={`${generation}:${userId}`}
      userId={userId}
      generation={generation}
    />
  );
}
/** Page-local reducer receives validated, atomic graph replacements. */
export function WorkflowDesignerSession({
  userId,
  generation,
}: {
  userId: string | null;
  generation: number;
}) {
  const [graph, commit] = useReducer(
    (_graph: WorkflowGraph, next: WorkflowGraph) => next,
    undefined,
    emptyGraph,
  );
  const [baseline, setBaseline] = useState(emptyGraph);
  const [loaded, setLoaded] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [draft, setDraft] = useState<PropertyDraft | null>(null);
  const [errors, setErrors] = useState<WorkflowError[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [source, setSource] = useState<string | null>(null);
  const [view, setView] = useState(initialView);
  const [interacting, setInteracting] = useState(false);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<{
    text: string;
    action: () => void;
    cancel?: () => void;
  } | null>(null);
  const canvasHost = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(false),
    importEpoch = useRef(0),
    importLock = useRef(false);
  const dimensions = () => ({
    width: canvasHost.current?.querySelector("svg")?.getBoundingClientRect().width ?? 600,
    height: 540,
  });
  const currentSession = () =>
    active.current &&
    getSessionGeneration() === generation &&
    useAuthStore.getState().isAuthenticated &&
    useAuthStore.getState().user?.userId === userId;
  const dirty = !graphEqual(graph, baseline) || draftDirty(draft) || previewDirty;
  const { blocker, dialog } = useUnsavedChangesGuard(dirty);
  const busy = !loaded || interacting || importing || !!confirm;
  useEffect(() => {
    active.current = true;
    const restored = restoreGraph(userId, () => localStorage);
    commit(restored.graph);
    setBaseline(restored.graph);
    setSavedOnce(restored.restored);
    setOverwrite(restored.needsOverwriteConfirm);
    setRestoreError(
      restored.errors.length
        ? `${messages(restored.errors)}\n当前以空图作为干净快照；原记录保持原样。`
        : "",
    );
    setLoaded(true);
    const { width, height } = dimensions();
    setView(fitView(restored.graph, width, height));
    return () => {
      active.current = false;
      importEpoch.current++;
      importLock.current = false;
    };
  }, [userId]);
  const change = (action: GraphAction) => {
    const result = updateGraph(graph, action);
    if (!result.ok) {
      setMessage(messages(result.errors));
      return false;
    }
    commit(result.value);
    setDraft((d) => syncDraftPosition(d, result.value));
    setMessage("");
    return true;
  };
  const switchSelection = (id: string | null, g = graph) => {
    setSelected(id);
    setDraft(makeDraft(g, id));
    setErrors([]);
  };
  const withDraftConfirm = (action: () => void) => {
    if (draftDirty(draft)) {
      setConfirm({ text: "放弃未应用的属性修改？已应用的图改动会保留。", action });
      return false;
    }
    action();
    return true;
  };
  const resetInteraction = () => {
    setSource(null);
    setTool("select");
  };
  const locateNode = (id: string | null) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return;
    const { width, height } = dimensions();
    setView((v) => {
      const zoom = v.zoom < 0.25 ? 1 : v.zoom;
      return {
        zoom,
        x: width / 2 - (node.position.x + 80) * zoom,
        y: height / 2 - (node.position.y + 32) * zoom,
      };
    });
  };
  const select = (id: string | null, locate = false) => {
    if (busy || importLock.current) return false;
    if (tool === "connect" && id) {
      if (!graph.nodes.some((n) => n.id === id)) return false;
      if (!source) {
        setSource(id);
        return true;
      }
      const edgeId = crypto.randomUUID();
      const result = updateGraph(graph, { type: "add-edge", id: edgeId, source, target: id });
      if (result.ok)
        withDraftConfirm(() => {
          commit(result.value);
          switchSelection(edgeId, result.value);
          resetInteraction();
          setMessage("");
        });
      else setMessage(messages(result.errors));
      return true;
    }
    if (id === selected) {
      if (locate) locateNode(id);
      return true;
    }
    return withDraftConfirm(() => {
      switchSelection(id);
      if (locate) locateNode(id);
    });
  };
  const add = () => {
    if (busy || importLock.current) return;
    withDraftConfirm(() => {
      const id = crypto.randomUUID(),
        offset = (graph.nodes.length % 6) * 20,
        { width, height } = dimensions();
      const result = updateGraph(graph, {
        type: "add-node",
        id,
        position: {
          x: (width / 2 - view.x) / view.zoom - 80 + offset,
          y: (height / 2 - view.y) / view.zoom - 32 + offset,
        },
      });
      if (result.ok) {
        commit(result.value);
        switchSelection(id, result.value);
        resetInteraction();
        setMessage("");
      } else setMessage(messages(result.errors));
    });
  };
  const remove = () => {
    if (!selected || busy || importLock.current) return;
    const node = graph.nodes.find((n) => n.id === selected),
      edge = graph.edges.find((e) => e.id === selected);
    if (!node && !edge) return;
    setConfirm({
      text:
        (node
          ? `删除状态“${node.label}”及 ${graph.edges.filter((e) => e.source === selected || e.target === selected).length} 条关联流转？`
          : `删除流转“${edge!.label}”？`) +
        (draftDirty(draft) ? " 未应用的属性修改也将舍弃。" : ""),
      action: () => {
        change({ type: "delete", id: selected });
        switchSelection(null);
        resetInteraction();
      },
    });
  };
  const candidate = () => {
    const result = applyDraft(graph, draft);
    if (!result.ok) {
      setErrors(result.errors);
      document.getElementById(fieldId(result.errors[0].field))?.focus();
      if (
        result.errors.some(
          (e) => !["label", "event", "condition", "description", "x", "y"].includes(e.field),
        )
      )
        setMessage(messages(result.errors));
      return null;
    }
    const graphErrors = validateGraph(result.value);
    if (graphErrors.length) {
      setMessage(messages(graphErrors));
      return null;
    }
    return result.value;
  };
  const apply = () => {
    if (busy || importLock.current) return;
    const next = candidate();
    if (next) {
      commit(next);
      switchSelection(selected, next);
      setMessage("");
    }
  };
  const save = () => {
    if (busy || importLock.current || !currentSession()) return;
    const next = candidate();
    if (!next) return;
    const write = () => {
      if (!currentSession()) return;
      const result = saveGraph(userId, next, () => localStorage);
      if (!result.ok) {
        setMessage(messages(result.errors));
        return;
      }
      commit(result.value);
      setBaseline(result.value);
      switchSelection(selected, result.value);
      setSavedOnce(true);
      setOverwrite(false);
      setRestoreError("");
      setMessage("");
    };
    if (overwrite)
      setConfirm({
        text: "原本机记录损坏或不可读。确认用当前图覆盖原记录？取消将保留原记录。",
        action: write,
      });
    else write();
  };
  const exportFile = () => {
    if (busy || importLock.current) return;
    const next = candidate();
    if (!next) return;
    const result = downloadGraph(next);
    if (!result.ok) {
      setMessage(messages(result.errors));
      return;
    }
    commit(next);
    switchSelection(selected, next);
    setMessage("已发起 JSON 下载；仍需保存到本机。");
  };
  const cancelImport = () => {
    importEpoch.current++;
    importLock.current = false;
    setImporting(false);
    setConfirm(null);
  };
  const importFile = async (file: File) => {
    if (busy || importLock.current || !currentSession()) return;
    const epoch = ++importEpoch.current;
    importLock.current = true;
    setImporting(true);
    const result = await readGraphFile(file);
    if (!currentSession() || epoch !== importEpoch.current) return;
    if (!result.ok) {
      setMessage(messages(result.errors));
      importLock.current = false;
      setImporting(false);
      return;
    }
    const replace = () => {
      if (!currentSession() || epoch !== importEpoch.current) return;
      commit(result.value);
      switchSelection(null, result.value);
      resetInteraction();
      setView(fitView(result.value, dimensions().width, dimensions().height));
      setMessage("");
      importLock.current = false;
      setImporting(false);
    };
    if (graph.nodes.length || graph.edges.length || draftDirty(draft))
      setConfirm({
        text: "替换整张图并舍弃未应用的属性？导入只改变当前编辑，本机记录保持原样，仍需保存到本机。",
        action: replace,
        cancel: cancelImport,
      });
    else replace();
  };
  const closeConfirm = () => {
    confirm?.cancel?.();
    setConfirm(null);
  };
  return (
    <section data-workflow-dirty={dirty}>
      {blocker}
      {dialog}
      <h1 className="text-xl font-semibold">工作流设计器</h1>
      <p className="my-2 text-sm">
        仅保存在当前浏览器，不会应用到业务工作流。多标签保存可能相互覆盖。
      </p>
      {restoreError && (
        <p role="alert" className="whitespace-pre-wrap">
          {restoreError}
        </p>
      )}
      {message && (
        <p role="alert" className="whitespace-pre-wrap">
          {message}
        </p>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="选择工作流 JSON 文件"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <div className="overflow-x-auto">
        <div className="flex min-w-[1020px] items-stretch gap-3">
          <WorkflowStatePanel
            graph={graph}
            selected={selected}
            disabled={busy}
            onSelect={(id) => select(id, true)}
            onAdd={add}
          />
          <main ref={canvasHost} className="min-w-[480px] flex-1">
            <WorkflowToolbar
              disabled={busy}
              selected={!!selected}
              nonempty={!!graph.nodes.length || !!graph.edges.length}
              tool={tool}
              view={view}
              onTool={(t) => {
                setTool(t);
                setSource(null);
              }}
              onDelete={remove}
              onClear={() =>
                setConfirm({
                  text: "清空整张图？未应用的属性修改也将舍弃；本机已保存记录保持不变，仍需重新保存。",
                  action: () => {
                    change({ type: "clear" });
                    switchSelection(null);
                    resetInteraction();
                  },
                })
              }
              onZoom={(delta) =>
                setView((v) => ({
                  ...v,
                  zoom: Math.min(2, Math.max(0.25, Math.round((v.zoom + delta) * 100) / 100)),
                }))
              }
              onFit={() => setView(fitView(graph, dimensions().width, dimensions().height))}
              persistence={{
                canSave: !!storageKey(userId),
                importing,
                onSave: save,
                onExport: exportFile,
                onImport: () => fileInput.current?.click(),
                onCancelImport: cancelImport,
                status: !loaded
                  ? "正在读取本机记录…"
                  : importing
                    ? "正在导入…"
                    : dirty
                      ? "未保存到本机"
                      : savedOnce
                        ? "已保存到本机"
                        : "空图，尚未保存到本机",
              }}
            />
            <p role="status">
              {tool === "connect"
                ? source
                  ? "请选择目标状态；Esc 取消连线"
                  : "请选择源状态；Esc 取消连线"
                : tool === "pan"
                  ? "拖动画布空白处平移"
                  : "选择状态或流转；拖动状态移动"}
            </p>
            <WorkflowCanvas
              graph={graph}
              selected={selected}
              source={source}
              view={view}
              tool={tool}
              disabled={busy}
              onSelect={select}
              onMove={(id, position) => change({ type: "move", id, position })}
              onView={setView}
              onInteraction={(moving, dirtyPreview) => {
                setInteracting(moving);
                setPreviewDirty(dirtyPreview);
              }}
              onDelete={remove}
              onEscape={() => {
                if (interacting) return;
                resetInteraction();
                select(null);
              }}
            />
          </main>
          <WorkflowPropertyPanel
            graph={graph}
            draft={draft}
            errors={errors}
            disabled={busy}
            onApply={apply}
            onCancel={() => withDraftConfirm(() => switchSelection(selected))}
            onChange={(field, value) => {
              setDraft((d) => (d ? { ...d, values: { ...d.values, [field]: value } } : d));
              setErrors((e) => e.filter((error) => error.field !== field));
            }}
          />
        </div>
      </div>
      <AppModal open={!!confirm} title="确认操作" onClose={closeConfirm} size="sm">
        <p>{confirm?.text}</p>
        <div className="mt-3 flex gap-2">
          <Button onPress={closeConfirm}>继续编辑</Button>
          <Button
            variant="danger"
            onPress={() => {
              const action = confirm?.action;
              setConfirm(null);
              action?.();
            }}
          >
            确定
          </Button>
        </div>
      </AppModal>
    </section>
  );
}
