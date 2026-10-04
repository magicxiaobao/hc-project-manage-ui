/**
 * 表单守卫共享组件：dirty check（未保存修改拦截）+ 必填标记 + 字段级报错。
 *
 * 设计：
 * - `useUnsavedChangesGuard(dirty)`：给一个表单接未保存拦截，返回
 *   `{ guard, dialog, blocker, markClean }`。
 *   - `blocker`：渲染在整页表单里，拦截 TanStack Router 的路由跳转，
 *     并通过 enableBeforeUnload 拦截浏览器刷新/关闭标签页。
 *   - `guard(action)`：包裹用户主动的离开动作（取消按钮、弹窗的 X/遮罩/Esc）。
 *     表单干净时直接执行 action；脏时弹出确认框。
 *   - `dialog`：确认框元素，表单内渲染一次即可。
 *   - `markClean()`：提交成功后、程序化跳转前调用，避免守卫拦截自己的
 *     成功跳转（此时 state 还没来得及回落到干净，ref 级别放行）。
 * - `RequiredMark`：必填字段标签后的红色星号（读屏器读作"必填"）。
 * - `FieldError`：字段下方的红色错误文案（role="alert"）。
 *
 * dirty 的判定由各表单自己负责（当前值 vs 初始值比较），本文件只管拦截。
 */
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { AppModal } from "@/components/biz/app-modal";

/** 必填星号：红色 *，读屏器读作"必填" */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="text-danger">
        *
      </span>
      <span className="sr-only">（必填）</span>
    </>
  );
}

/** 字段级错误提示：字段下方的红色小字，无错误时不渲染 */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-danger">
      {message}
    </p>
  );
}

/** "是否放弃修改"确认弹窗 */
export function DiscardConfirmDialog({
  open,
  onDiscard,
  onKeep,
}: {
  open: boolean;
  onDiscard: () => void;
  onKeep: () => void;
}) {
  return (
    <AppModal open={open} title="是否放弃修改？" onClose={onKeep} size="sm">
      <p className="type-body">表单有未保存的修改，离开后这些修改将丢失。</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onPress={onKeep}>
          继续编辑
        </Button>
        <Button variant="danger" onPress={onDiscard}>
          放弃修改
        </Button>
      </div>
    </AppModal>
  );
}

/**
 * 路由跳转拦截器（整页表单用）。
 * 用 ref 持有最新的 dirty，避免闭包过期；markClean 后放行一次（成功跳转场景）。
 */
function RouteBlocker({
  shouldBlockFn,
  enabled,
}: {
  shouldBlockFn: () => boolean;
  enabled: boolean;
}) {
  // withResolver: true 让 TS 推导出 BlockerResolver，blocked 时 proceed()/reset() 可用
  const blocker = useBlocker({ shouldBlockFn, enableBeforeUnload: enabled, withResolver: true });
  if (blocker.status !== "blocked") return null;
  return (
    <DiscardConfirmDialog
      open
      onDiscard={() => blocker.proceed()}
      onKeep={() => blocker.reset()}
    />
  );
}

export function useUnsavedChangesGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const cleanRef = useRef(false);
  // 表单回到干净态时重新布防（成功跳转后组件一般会卸载，这里是兜底）
  useEffect(() => {
    if (!dirty) cleanRef.current = false;
  }, [dirty ]);

  const shouldBlock = useCallback(() => dirtyRef.current && !cleanRef.current, []);

  const [confirming, setConfirming] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  /** 包裹用户主动的离开动作：脏时先确认，干净时直接执行 */
  const guard = useCallback(
    (action: () => void) => {
      if (!shouldBlock()) {
        action();
        return;
      }
      pendingRef.current = action;
      setConfirming(true);
    },
    [shouldBlock],
  );

  /** 提交成功后调用：放行随后的程序化跳转（state 回落前的 ref 级别放行） */
  const markClean = useCallback(() => {
    cleanRef.current = true;
  }, []);

  const dialog = (
    <DiscardConfirmDialog
      open={confirming}
      onDiscard={() => {
        setConfirming(false);
        const action = pendingRef.current;
        pendingRef.current = null;
        // 用户已确认放弃：放行随后的程序化离开，避免路由守卫二次拦截
        cleanRef.current = true;
        action?.();
      }}
      onKeep={() => {
        setConfirming(false);
        pendingRef.current = null;
      }}
    />
  );

  const blocker = <RouteBlocker shouldBlockFn={shouldBlock} enabled={dirty} />;

  return { guard, dialog, blocker, markClean };
}
