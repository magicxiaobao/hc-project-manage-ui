import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { toast } from "sonner";
import { AppModal } from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import type { MenuResponse } from "@/lib/api/system-types";
import { buildMenuTree, flattenMenuTree, isMenuId } from "@/lib/menu-tree";
import {
  toUserMessage,
  useInvalidMenu,
  useMenuListAll,
  useMenuTree,
  useValidMenu,
} from "@/lib/query";
import { MenuFormDialog } from "./menu-form-dialog";
import { MenuTree } from "./menu-tree";
import { MenuUserPreview } from "./menu-user-preview";

export function MenuListLive() {
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const roots = useMenuTree();
  const list = useMenuListAll();
  const valid = useValidMenu();
  const invalid = useInvalidMenu();
  const pending = valid.isPending || invalid.isPending;
  const pendingRef = useRef(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<{ open: boolean; menuId: number | null }>({
    open: false,
    menuId: null,
  });
  const [target, setTarget] = useState<{ row: MenuResponse; action: "valid" | "invalid" } | null>(
    null,
  );
  const [actionError, setActionError] = useState("");
  const tree = useMemo(
    () => buildMenuTree(list.data ?? [], roots.data ?? []),
    [list.data, roots.data],
  );
  const ids = useMemo(
    () =>
      new Set(
        [...flattenMenuTree(tree.roots), ...flattenMenuTree(tree.anomalies)].map(
          ({ node }) => node.id,
        ),
      ),
    [tree],
  );
  useEffect(() => {
    setExpanded((previous) => new Set([...previous].filter((id) => ids.has(id))));
  }, [ids]);
  const ready =
    roots.data !== undefined &&
    list.data !== undefined &&
    !roots.isError &&
    !list.isError &&
    !roots.isFetching &&
    !list.isFetching;
  const loading = roots.isLoading || list.isLoading;
  const failed = roots.isError || list.isError;
  const loaded = roots.data !== undefined && list.data !== undefined;
  const refresh = () => {
    void roots.refetch();
    void list.refetch();
  };
  const toggle = (id: number) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const verb = target?.action === "valid" ? "启用" : "禁用";
  const closeAction = () => {
    if (!pending && !pendingRef.current) {
      setTarget(null);
      setActionError("");
    }
  };
  const confirm = async () => {
    if (!allowed || !target || pending || pendingRef.current || !isMenuId(target.row.id)) return;
    pendingRef.current = true;
    setActionError("");
    try {
      await { valid, invalid }[target.action].mutateAsync(target.row.id);
      toast.success(`菜单已${verb}`);
      setTarget(null);
    } catch (error) {
      setActionError(toUserMessage(error));
    } finally {
      pendingRef.current = false;
    }
  };
  const actions = (row: MenuResponse) => (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="ghost"
        isDisabled={pending}
        onPress={() => setForm({ open: true, menuId: row.id })}
      >
        编辑
      </Button>
      {(["valid", "invalid"] as const).map((action) => (
        <Button
          key={action}
          size="sm"
          variant="ghost"
          isDisabled={pending}
          onPress={() => {
            setTarget({ row, action });
            setActionError("");
          }}
        >
          {action === "valid" ? "启用" : "禁用"}
        </Button>
      ))}
    </div>
  );
  if (!allowed) return <p className="p-6">需要系统管理员权限</p>;
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">菜单管理</h1>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            isDisabled={!loaded}
            onPress={() =>
              setExpanded(
                new Set(
                  flattenMenuTree(tree.roots)
                    .filter(({ node }) => node.children.length)
                    .map(({ node }) => node.id),
                ),
              )
            }
          >
            全部展开
          </Button>
          <Button variant="ghost" onPress={() => setExpanded(new Set())}>
            全部折叠
          </Button>
          <Button
            variant="ghost"
            isDisabled={roots.isFetching || list.isFetching}
            onPress={refresh}
          >
            刷新
          </Button>
          <Button
            variant="primary"
            isDisabled={pending}
            onPress={() => setForm({ open: true, menuId: null })}
          >
            新增菜单
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner size="sm" />
          正在加载完整菜单结构…
        </div>
      ) : null}
      {failed ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-danger">
            {loaded ? "刷新失败，当前展示上次数据，父级选择暂停" : "完整菜单结构加载失败"}：
            {toUserMessage(roots.error ?? list.error)}
          </p>
          <Button isDisabled={roots.isFetching || list.isFetching} onPress={refresh}>
            重试
          </Button>
        </div>
      ) : null}
      {loaded ? (
        <>
          <MenuTree nodes={tree.roots} expanded={expanded} onToggle={toggle} actions={actions} />
          {tree.anomalies.length ? (
            <section className="flex flex-col gap-3" aria-label="菜单关系异常">
              <p role="alert" className="text-danger">
                以下记录存在孤儿、自指或循环关系，未作为正常根菜单或父级选项。请编辑后重新选择合法父级。
              </p>
              <p className="type-meta">
                {tree.anomalies.map((node) => `#${node.id} → 父级 #${node.parentId}`).join("；")}
              </p>
              <MenuTree
                nodes={tree.anomalies}
                expanded={expanded}
                onToggle={toggle}
                actions={actions}
                label="菜单异常记录"
              />
            </section>
          ) : null}
        </>
      ) : null}
      <MenuUserPreview />
      <MenuFormDialog
        open={form.open}
        menuId={form.menuId}
        tree={tree}
        records={list.data ?? []}
        parentsReady={ready}
        onClose={() => setForm({ open: false, menuId: null })}
      />
      <AppModal open={target !== null} title={`${verb}菜单`} onClose={closeAction} size="sm">
        <p className="text-sm">
          确定{verb}菜单「{target?.row.name ?? "未命名"} (#{target?.row.id}
          )」？仅作用于该记录，不递归{verb}后代。
        </p>
        {actionError ? (
          <p role="alert" className="mt-3 text-danger">
            {actionError}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" isDisabled={pending} onPress={closeAction}>
            取消
          </Button>
          <Button
            variant="primary"
            isDisabled={pending}
            onPress={() => {
              void confirm();
            }}
          >
            {pending ? "处理中…" : `确定${verb}`}
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
