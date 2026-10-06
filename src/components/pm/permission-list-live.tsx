import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Label, Spinner, TextField } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, OptionSelect } from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import type { PermissionResponse } from "@/lib/api/system-types";
import {
  toUserMessage,
  useDeletePermission,
  useInvalidPermission,
  usePermissionListAll,
  useValidPermission,
} from "@/lib/query";
import {
  emptyPermissionFilters,
  filterPermissionsLocal,
  formatPermissionTime,
  paginatePermissions,
  PERMISSION_TYPES,
  permissionActionCopy,
  permissionGroupLabel,
  permissionStatusLabel,
  permissionText,
  permissionTypeLabel,
  type PermissionAction,
} from "@/lib/permission-form";
import { isPermissionId } from "@/lib/role-permissions";
import { PermissionFormDialog } from "./permission-form-dialog";

export function PermissionListLive() {
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const list = usePermissionListAll(allowed);
  const valid = useValidPermission();
  const invalid = useInvalidPermission();
  const remove = useDeletePermission();
  const pending = valid.isPending || invalid.isPending || remove.isPending;
  const pendingRef = useRef(false);
  const [input, setInput] = useState(emptyPermissionFilters);
  const [submitted, setSubmitted] = useState(emptyPermissionFilters);
  const [page, setPage] = useState(1);
  const [formTarget, setFormTarget] = useState<{ open: boolean; permissionId: number | null }>({
    open: false,
    permissionId: null,
  });
  const [target, setTarget] = useState<{
    row: PermissionResponse;
    action: PermissionAction;
  } | null>(null);
  const [actionError, setActionError] = useState("");
  const rows = useMemo(
    () => filterPermissionsLocal(list.data ?? [], submitted),
    [list.data, submitted],
  );
  const display = paginatePermissions(rows, page);
  useEffect(() => {
    if (display.page !== page) setPage(display.page);
  }, [display.page, page]);
  const search = () => {
    setSubmitted({ ...input });
    setPage(1);
  };
  const reset = () => {
    setInput(emptyPermissionFilters());
    setSubmitted(emptyPermissionFilters());
    setPage(1);
  };
  const openAction = (row: PermissionResponse, action: PermissionAction) => {
    setActionError("");
    setTarget({ row, action });
  };
  const closeAction = () => {
    if (pending || pendingRef.current) return;
    setTarget(null);
    setActionError("");
  };
  const copy = target ? permissionActionCopy(target.action, target.row) : null;
  const confirm = async () => {
    if (!allowed || !target || pending || pendingRef.current || !isPermissionId(target.row.id))
      return;
    const current = target;
    pendingRef.current = true;
    setActionError("");
    try {
      await { valid, invalid, delete: remove }[current.action].mutateAsync(current.row.id);
      toast.success(permissionActionCopy(current.action, current.row).success);
      setTarget(null);
    } catch (error) {
      setActionError(toUserMessage(error));
    } finally {
      pendingRef.current = false;
    }
  };
  if (!allowed) return <p className="p-6">该操作需要系统管理员权限。当前后端管理接口尚不支持细粒度权限。</p>;
  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">权限点管理</h1>
        <Button
          variant="primary"
          isDisabled={pending}
          onPress={() => setFormTarget({ open: true, permissionId: null })}
        >
          新增权限点
        </Button>
      </div>
      <form
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <TextField
          value={input.permissionCode}
          onChange={(value) => setInput((state) => ({ ...state, permissionCode: value }))}
          aria-label="权限编码筛选"
        >
          <Label>权限编码</Label>
          <Input />
        </TextField>
        <div>
          <div className="mb-1 text-sm">权限类型</div>
          <OptionSelect
            label="权限类型"
            value={input.permissionType}
            options={[{ id: "", label: "全部" }, ...PERMISSION_TYPES]}
            onChange={(value) => setInput((state) => ({ ...state, permissionType: value }))}
          />
        </div>
        <TextField
          value={input.groupName}
          onChange={(value) => setInput((state) => ({ ...state, groupName: value }))}
          aria-label="所属分组筛选"
        >
          <Label>所属分组</Label>
          <Input />
        </TextField>
        <div className="flex gap-2">
          <Button type="submit" variant="primary">
            搜索
          </Button>
          <Button variant="ghost" onPress={reset}>
            重置
          </Button>
          <Button
            variant="ghost"
            isDisabled={list.isFetching}
            onPress={() => {
              void list.refetch();
            }}
          >
            刷新
          </Button>
        </div>
      </form>
      {list.isLoading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner size="sm" />
          正在加载权限点…
        </div>
      ) : list.isError ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-danger">
            {list.data ? "后台刷新失败，当前数据未更新" : "完整权限列表加载失败"}：
            {toUserMessage(list.error)}
          </p>
          <Button
            onPress={() => {
              void list.refetch();
            }}
            isDisabled={list.isFetching}
          >
            重试
          </Button>
        </div>
      ) : null}
      {!list.isLoading && list.data ? (
        <>
          <div className="overflow-x-auto rounded-lg border border-default-200">
            <table className="w-full text-left text-sm" aria-label="权限点列表">
              <thead>
                <tr>
                  {[
                    "权限名称",
                    "权限编码",
                    "权限类型",
                    "所属分组",
                    "描述",
                    "状态",
                    "更新时间",
                    "操作",
                  ].map((label) => (
                    <th key={label} className="whitespace-nowrap bg-default-100 px-3 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {display.rows.map((row) => (
                  <tr key={row.id} className="border-t border-default-200">
                    <td className="px-3 py-3">{permissionText(row.permissionName)}</td>
                    <td className="px-3 py-3">{permissionText(row.permissionCode)}</td>
                    <td className="px-3 py-3">{permissionTypeLabel(row.permissionType)}</td>
                    <td className="px-3 py-3">{permissionGroupLabel(row.groupName)}</td>
                    <td className="max-w-64 whitespace-pre-wrap px-3 py-3">
                      {permissionText(row.description)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {permissionStatusLabel(row.enabled)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatPermissionTime(row.updatedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={pending || !isPermissionId(row.id)}
                          onPress={() => setFormTarget({ open: true, permissionId: row.id })}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={pending || !isPermissionId(row.id)}
                          onPress={() =>
                            openAction(row, row.enabled === true ? "invalid" : "valid")
                          }
                        >
                          {row.enabled === true ? "禁用" : "启用"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          isDisabled={pending || !isPermissionId(row.id)}
                          onPress={() => openAction(row, "delete")}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {display.total === 0 ? (
              <p className="py-8 text-center text-default-500">
                {list.data.length === 0 ? "暂无权限点" : "没有匹配的权限点"}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="type-meta">
              共 {display.total} 个权限点 · 第 {display.page} / {display.totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                isDisabled={display.page <= 1}
                onPress={() => setPage(display.page - 1)}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={display.page >= display.totalPages}
                onPress={() => setPage(display.page + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      ) : null}
      <PermissionFormDialog
        open={formTarget.open}
        permissionId={formTarget.permissionId}
        onClose={() => setFormTarget({ open: false, permissionId: null })}
      />
      <AppModal
        open={target !== null}
        title={copy?.title ?? "权限点操作"}
        onClose={closeAction}
        size="sm"
      >
        <p className="text-sm">{copy?.message}</p>
        {actionError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {actionError}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" isDisabled={pending} onPress={closeAction}>
            取消
          </Button>
          <Button
            variant={target?.action === "delete" ? "danger" : "primary"}
            isDisabled={pending}
            onPress={() => {
              void confirm();
            }}
          >
            {pending ? "处理中…" : copy?.confirm}
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
