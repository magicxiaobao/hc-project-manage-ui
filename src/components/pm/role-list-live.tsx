/**
 * 角色列表（P5 p5-role-list）：系统管理 → 角色。
 *
 * 后端契约（p5-api 时建模，见 src/lib/api/system-types.ts）：
 * - POST /role/v1/findByPage { page, pageSize, bean:{ roleName?, roleCode? } }
 *   分页；但注意 2026-10-05 实读后端 RoleServiceImpl.findByPage（:93-99）
 *   确认 bean 完全不被读取（服务端空操作），故筛选/分页全在前端做：
 *   useRoleListAll 循环拉全量 → filterRolesLocal 本地过滤 → slice 本地分页；
 * - POST /role/v1/valid/{id} 启用、POST /role/v1/invalid/{id} 禁用；
 * - RoleResponse.enabled 有映射（user-roles-dialog 按 role.enabled===true
 *   过滤搜索证据），状态列诚实展示启用/禁用；null（防御）按启用口径处理，
 *   与 role-form-dialog 的回填默认值一致。
 *
 * 列：角色名称 / 角色编码 / 描述 / 状态 / 更新时间 / 操作。
 * 行操作：编辑（role-form-dialog 弹窗）、启用/禁用（二次确认）、启用角色分配权限。
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Chip, Input, Spinner } from "@heroui/react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { AppModal, EmptyHint, PageHeading, RegisteredButtons } from "@/components/biz";
import { roleButtons, isRoleButtonDisabled } from "@/lib/buttons/domains/roles";
import { RoleFormDialog } from "@/components/pm/role-form-dialog";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import {
  filterRolesLocal,
  toUserMessage,
  useInvalidRole,
  useRoleListAll,
  useValidRole,
} from "@/lib/query";
import { notifyPmChange } from "@/lib/pm/feedback";
import type { RoleResponse } from "@/lib/api/system-types";

const PAGE_SIZE = 20;

function formatDateTime(value: number | null): string {
  if (value == null) return "—";
  // 后端时间戳为 Unix 秒 epoch（DateMapper.getEpochSecond），Date 构造需毫秒
  return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

/** null（防御分支）按启用口径：与 role-form-dialog 的回填默认值一致 */
function isRoleEnabled(role: RoleResponse): boolean {
  return role.enabled ?? true;
}

export function RoleListLive() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 与 /sys/users 布局路由守卫共用同一判定函数（r4 P1-1）：组件内做二次兜底。
  const authorities = useAuthStore((state) => state.user?.authorities);

  const [roleName, setRoleName] = useState("");
  const [roleCode, setRoleCode] = useState("");
  // 提交态：只有点"搜索"才真正发请求，避免每次敲字都换 queryKey
  const [submitted, setSubmitted] = useState({ roleName: "", roleCode: "" });
  const [page, setPage] = useState(1);
  // 启用/禁用二次确认的目标角色
  const [toggleTarget, setToggleTarget] = useState<{
    role: RoleResponse;
    action: "valid" | "invalid";
  } | null>(null);
  // 新建/编辑弹窗：roleId=null 为新建，否则编辑该角色（p5-role-list）
  const [formTarget, setFormTarget] = useState<{ open: boolean; roleId: number | null }>({
    open: false,
    roleId: null,
  });

  // 筛选在前端全量做：后端 RoleServiceImpl.findByPage 不读 bean（2026-10-05
  // 实读确认），服务端分页+bean 筛选是空操作，故用 useRoleListAll 拉全量、
  // filterRolesLocal 本地过滤、slice 本地分页。useRoleList（服务端分页）
  // 保留供其它场景使用。
  const { data, isLoading, isError, error, refetch, isRefetching } = useRoleListAll();

  const filteredRoles = useMemo(
    () => filterRolesLocal(data ?? [], submitted.roleName, submitted.roleCode),
    [data, submitted],
  );

  const validRole = useValidRole();
  const invalidRole = useInvalidRole();
  const toggling = validRole.isPending || invalidRole.isPending;

  const total = filteredRoles.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRoles = filteredRoles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // 页码越界（启用/禁用导致当前页变空）时自动回到最后一页；effect 无条件调用。
  useEffect(() => {
    if (!isLoading && page > totalPages) {
      setPage(totalPages);
    }
  }, [isLoading, total, totalPages, page]);

  if (!isAuthenticated || !hasSystemAdmin(authorities)) {
    return (
      <EmptyHint>
        该操作需要系统管理员权限。当前账号可访问此页面，但后端管理接口尚不支持细粒度权限。
      </EmptyHint>
    );
  }

  const handleSearch = () => {
    setSubmitted({ roleName, roleCode });
    setPage(1);
  };
  const handleReset = () => {
    setRoleName("");
    setRoleCode("");
    setSubmitted({ roleName: "", roleCode: "" });
    setPage(1);
  };

  const handleToggle = () => {
    if (!toggleTarget) return;
    const { role, action } = toggleTarget;
    const mutate = action === "valid" ? validRole : invalidRole;
    const verb = action === "valid" ? "启用" : "禁用";
    const label = role.roleName ?? role.roleCode ?? role.id;
    mutate.mutate(role.id, {
      onSuccess: () => {
        notifyPmChange(`已${verb}角色 ${label}`);
        setToggleTarget(null);
      },
      onError: (err) => {
        toast.error(`${verb}失败：${toUserMessage(err)}`);
        setToggleTarget(null);
      },
    });
  };

  const toggleVerb = toggleTarget?.action === "valid" ? "启用" : "禁用";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="角色管理" hint="系统管理员：角色列表、新建、编辑、启用、禁用。角色编码全局唯一，可为启用角色分配权限。" />
        <RegisteredButtons
          domain={roleButtons}
          context={{
            placement: "toolbar",
            row: null,
            disabled: false,
            openCreate: () => setFormTarget({ open: true, roleId: null }),
            openEdit: (roleId) => setFormTarget({ open: true, roleId }),
          }}
          isContextDisabled={isRoleButtonDisabled}
          variant="primary"
          onActionError={(error) => toast.error(toUserMessage(error, "角色操作失败"))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-surface p-3">
        <Input
          aria-label="角色名称"
          placeholder="角色名称"
          value={roleName}
          onChange={(event) => setRoleName(event.target.value)}
          className="max-w-56"
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSearch();
          }}
        />
        <Input
          aria-label="角色编码"
          placeholder="角色编码"
          value={roleCode}
          onChange={(event) => setRoleCode(event.target.value)}
          className="max-w-56"
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSearch();
          }}
        />
        <Button variant="primary" onPress={handleSearch}>
          搜索
        </Button>
        <Button variant="ghost" onPress={handleReset}>
          重置
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在从后端加载角色…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-3 py-8 text-sm text-danger">
          <span>加载失败：{toUserMessage(error, "加载角色列表失败")}</span>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={isRefetching}
            onPress={() => {
              void refetch();
            }}
          >
            重试
          </Button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-sm border border-border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface text-left text-default-600">
                  <th className="px-3 py-2 font-medium">角色名称</th>
                  <th className="px-3 py-2 font-medium">角色编码</th>
                  <th className="px-3 py-2 font-medium">描述</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">更新时间</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {pageRoles.map((role) => {
                  const enabled = isRoleEnabled(role);
                  return (
                    <tr key={role.id} className="border-t border-border hover:bg-surface">
                      <td className="px-3 py-2 font-medium">{role.roleName ?? "—"}</td>
                      <td className="px-3 py-2">
                        <code className="rounded bg-surface px-1 py-0.5 text-xs">
                          {role.roleCode ?? "—"}
                        </code>
                      </td>
                      <td className="max-w-64 truncate px-3 py-2 text-default-600">
                        {role.description ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {enabled ? (
                          <Chip size="sm" color="success" variant="soft">
                            启用
                          </Chip>
                        ) : (
                          <Chip size="sm" color="default" variant="soft">
                            禁用
                          </Chip>
                        )}
                      </td>
                      <td className="px-3 py-2 text-default-600">
                        {formatDateTime(role.updatedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" isDisabled={role.enabled !== true}
                            onPress={() => { void navigate({ to: '/sys/roles/$roleId/permissions', params: { roleId: String(role.id) } }); }}>
                            分配权限
                          </Button>
                          <RegisteredButtons
                            domain={roleButtons}
                            context={{
                              placement: "row",
                              row: role,
                              disabled: false,
                              openCreate: () => setFormTarget({ open: true, roleId: null }),
                              openEdit: (roleId) => setFormTarget({ open: true, roleId }),
                            }}
                            isContextDisabled={isRoleButtonDisabled}
                            size="sm"
                            variant="ghost"
                            onActionError={(error) =>
                              toast.error(toUserMessage(error, "角色操作失败"))
                            }
                          />
                          {enabled ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              isDisabled={toggling}
                              onPress={() => setToggleTarget({ role, action: "invalid" })}
                            >
                              禁用
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              isDisabled={toggling}
                              onPress={() => setToggleTarget({ role, action: "valid" })}
                            >
                              启用
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pageRoles.length === 0 && total === 0 ? (
              <p className="py-8 text-center text-sm text-default-500">暂无角色</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="type-meta">
              共 {total} 个角色 · 第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                isDisabled={page <= 1 || isLoading}
                onPress={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={page >= totalPages || isLoading}
                onPress={() => setPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}

      <RoleFormDialog
        open={formTarget.open}
        roleId={formTarget.roleId}
        onClose={() => setFormTarget({ open: false, roleId: null })}
      />

      <AppModal
        open={toggleTarget != null}
        title={`${toggleVerb}角色`}
        size="sm"
        onClose={() => setToggleTarget(null)}
      >
        <p className="text-sm">
          确定要{toggleVerb}角色{" "}
          <span className="font-medium">
            {toggleTarget?.role.roleName ?? toggleTarget?.role.roleCode ?? toggleTarget?.role.id}
          </span>{" "}
          吗？
          {toggleTarget?.action === "invalid"
            ? "禁用后该角色将标记为禁用状态。"
            : "启用后该角色将标记为启用状态。"}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setToggleTarget(null)} isDisabled={toggling}>
            取消
          </Button>
          <Button
            variant={toggleTarget?.action === "invalid" ? "danger" : "primary"}
            isDisabled={toggling}
            onPress={handleToggle}
          >
            {toggling ? `${toggleVerb}中…` : `确定${toggleVerb}`}
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
