import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { WorkflowGraph } from "@/lib/workflow-designer";
export const NODE_WIDTH = 160,
  NODE_HEIGHT = 64;
export interface View {
  x: number;
  y: number;
  zoom: number;
}
export const initialView = (): View => ({ x: 0, y: 0, zoom: 1 });
export function fitView(graph: WorkflowGraph, width: number, height: number): View {
  if (!graph.nodes.length) return initialView();
  const minX = Math.min(...graph.nodes.map((n) => n.position.x)),
    minY = Math.min(...graph.nodes.map((n) => n.position.y));
  const maxX = Math.max(...graph.nodes.map((n) => n.position.x + NODE_WIDTH)),
    maxY = Math.max(...graph.nodes.map((n) => n.position.y + NODE_HEIGHT));
  const zoom = Math.min(
    1,
    Math.max(1, width - 80) / Math.max(NODE_WIDTH, maxX - minX),
    Math.max(1, height - 80) / Math.max(NODE_HEIGHT, maxY - minY),
  );
  return {
    zoom,
    x: width / 2 - (minX / 2 + maxX / 2) * zoom,
    y: height / 2 - (minY / 2 + maxY / 2) * zoom,
  };
}
export function edgeGeometry(graph: WorkflowGraph, source: string, target: string) {
  const a = graph.nodes.find((n) => n.id === source),
    b = graph.nodes.find((n) => n.id === target);
  if (!a || !b) return null;
  const ax = a.position.x + NODE_WIDTH / 2,
    ay = a.position.y + NODE_HEIGHT / 2;
  const bx = b.position.x + NODE_WIDTH / 2,
    by = b.position.y + NODE_HEIGHT / 2;
  const dx = bx - ax,
    dy = by - ay,
    length = Math.hypot(dx, dy) || 1;
  const offset = graph.edges.some((e) => e.source === target && e.target === source)
    ? 44
    : dx === 0 && dy === 0
      ? 90
      : 0;
  const cx = ax / 2 + bx / 2 - (dy / length) * offset,
    cy = ay / 2 + by / 2 + (dx / length) * offset;
  const boundary = (x: number, y: number, tx: number, ty: number) => {
    const vx = tx - x || (ty === y ? 1 : 0),
      vy = ty - y;
    const scale = 1 / Math.max(Math.abs(vx) / (NODE_WIDTH / 2), Math.abs(vy) / (NODE_HEIGHT / 2));
    return { x: x + vx * scale, y: y + vy * scale };
  };
  const start = boundary(ax, ay, cx, cy),
    end = boundary(bx, by, cx, cy);
  return {
    path: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,
    x: start.x / 4 + cx / 2 + end.x / 4,
    y: start.y / 4 + cy / 2 + end.y / 4,
  };
}
export type Tool = "select" | "connect" | "pan";
interface CanvasProps {
  graph: WorkflowGraph;
  selected: string | null;
  view: View;
  source?: string | null;
  onSelect: (id: string | null) => boolean | void;
  tool?: Tool;
  disabled?: boolean;
  onMove?: (id: string, position: { x: number; y: number }) => void;
  onView?: (view: View) => void;
  onInteraction?: (active: boolean, dirty: boolean) => void;
  onDelete?: () => void;
  onEscape?: () => void;
}
interface Gesture {
  pointer: number;
  element: Element;
  id: string | null;
  start: { x: number; y: number };
  origin: { x: number; y: number };
}

export function WorkflowCanvas({
  graph,
  selected,
  view,
  source,
  onSelect,
  tool = "select",
  disabled = false,
  onMove,
  onView,
  onInteraction,
  onDelete,
  onEscape,
}: CanvasProps) {
  const layer = useRef<SVGGElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null),
    suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ id: string; position: { x: number; y: number } } | null>(
    null,
  );
  const previewRef = useRef<typeof preview>(null);
  const panRef = useRef<View | null>(null);
  const [pan, setPan] = useState<View | null>(null);
  const end = (commit: boolean) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    if (g.element.hasPointerCapture(g.pointer)) g.element.releasePointerCapture(g.pointer);
    if (commit && g.id && previewRef.current) onMove?.(g.id, previewRef.current.position);
    if (commit && !g.id && panRef.current) onView?.(panRef.current);
    previewRef.current = null;
    panRef.current = null;
    setPreview(null);
    setPan(null);
    onInteraction?.(false, false);
  };
  useEffect(
    () => () => {
      const g = gesture.current;
      if (g?.element.hasPointerCapture(g.pointer)) g.element.releasePointerCapture(g.pointer);
    },
    [],
  );
  const point = (event: ReactPointerEvent): { x: number; y: number } | null => {
    const matrix = layer.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const start = (event: ReactPointerEvent, id: string | null) => {
    if (disabled || event.button !== 0 || gesture.current || tool === "connect") return;
    if (id && tool === "pan") return;
    if (!id && tool !== "pan") return;
    if (id && selected !== id && onSelect(id) === false) return;
    const p = id ? point(event) : { x: event.clientX, y: event.clientY };
    const node = graph.nodes.find((n) => n.id === id);
    if (!p || (id && !node)) return;
    event.preventDefault();
    event.stopPropagation();
    svg.current?.focus();
    suppressClick.current = false;
    gesture.current = {
      pointer: event.pointerId,
      element: event.currentTarget,
      id,
      start: p,
      origin: node ? node.position : { x: view.x, y: view.y },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onInteraction?.(true, !!id);
  };
  const move = (event: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    const p = g.id ? point(event) : { x: event.clientX, y: event.clientY };
    if (!p) return;
    const position = { x: g.origin.x + p.x - g.start.x, y: g.origin.y + p.y - g.start.y };
    if (position.x !== g.origin.x || position.y !== g.origin.y) suppressClick.current = true;
    if (g.id) {
      previewRef.current = { id: g.id, position };
      setPreview(previewRef.current);
    } else {
      panRef.current = { ...view, ...position };
      setPan(panRef.current);
    }
  };
  const choose = (id: string | null) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!disabled) onSelect(id);
  };
  const displayGraph = preview
    ? {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === preview.id ? { ...n, position: preview.position } : n,
        ),
      }
    : graph;
  const displayView = pan ?? view;
  const marker = `workflow-arrow-${useId().replace(/:/g, "")}`;
  return (
    <svg
      ref={svg}
      role="group"
      aria-label="工作流画布"
      tabIndex={0}
      className="h-[540px] w-full min-w-[480px] touch-none border bg-surface"
      onClick={() => choose(null)}
      onPointerDown={(e) => {
        if (!(e.target as Element).closest("[data-node-id], [data-edge-id]")) start(e, null);
      }}
      onPointerMove={move}
      onPointerUp={(e) => {
        if (gesture.current?.pointer === e.pointerId) end(true);
      }}
      onPointerCancel={(e) => {
        if (gesture.current?.pointer === e.pointerId) end(false);
      }}
      onLostPointerCapture={() => end(false)}
      onKeyDown={(e) => {
        if (
          e.nativeEvent.isComposing ||
          document.querySelector('[role="dialog"]') ||
          (e.target as Element).closest('input, textarea, select, [contenteditable="true"]')
        )
          return;
        if (e.key === "Escape") {
          e.preventDefault();
          end(false);
          onEscape?.();
        }
        if (e.key === "Delete" && !disabled && !gesture.current) {
          e.preventDefault();
          onDelete?.();
        }
      }}
    >
      <defs>
        <marker
          id={marker}
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <g
        ref={layer}
        data-graph-layer
        transform={`translate(${displayView.x} ${displayView.y}) scale(${displayView.zoom})`}
      >
        {displayGraph.edges.map((edge) => {
          const geometry = edgeGeometry(displayGraph, edge.source, edge.target);
          if (!geometry) return null;
          return (
            <g
              key={edge.id}
              role="button"
              tabIndex={0}
              aria-label={`流转 ${edge.label}：${graph.nodes.find((n) => n.id === edge.source)?.label} → ${graph.nodes.find((n) => n.id === edge.target)?.label}`}
              aria-pressed={selected === edge.id}
              data-edge-id={edge.id}
              onClick={(e) => {
                e.stopPropagation();
                choose(edge.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  choose(edge.id);
                }
              }}
            >
              <path
                d={geometry.path}
                fill="none"
                stroke="currentColor"
                strokeWidth={selected === edge.id ? 3 : 1.5}
                markerEnd={`url(#${marker})`}
              />
              <path d={geometry.path} fill="none" stroke="transparent" strokeWidth="16" />
              <text
                x={geometry.x}
                y={geometry.y - 8}
                textAnchor="middle"
                className="text-xs"
                fill="currentColor"
              >
                {selected === edge.id ? "已选中 · " : ""}
                {edge.label.length > 18 ? edge.label.slice(0, 17) + "…" : edge.label}
              </text>
            </g>
          );
        })}
        {displayGraph.nodes.map((node) => (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`状态 ${node.label}`}
            aria-pressed={selected === node.id}
            data-node-id={node.id}
            transform={`translate(${node.position.x} ${node.position.y})`}
            onPointerDown={(e) => start(e, node.id)}
            onClick={(e) => {
              e.stopPropagation();
              choose(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                choose(node.id);
              }
            }}
          >
            <title>{node.label}</title>
            <rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx="8"
              className="fill-surface"
              stroke="currentColor"
              strokeWidth={selected === node.id || source === node.id ? 3 : 1}
              strokeDasharray={source === node.id ? "6 3" : undefined}
            />
            <text x={NODE_WIDTH / 2} y="28" textAnchor="middle" fill="currentColor">
              {node.label.length > 12 ? node.label.slice(0, 11) + "…" : node.label}
            </text>
            <text
              x={NODE_WIDTH / 2}
              y="49"
              textAnchor="middle"
              fill="currentColor"
              className="text-xs"
            >
              {source === node.id ? "流转起点" : selected === node.id ? "已选中" : "状态"}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
