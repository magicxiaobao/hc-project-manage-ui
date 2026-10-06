/**
 * 用户列表（P5 p5-user-list）：系统管理 → 用户。
 *
 * 对标老前端 views/user/UserList.vue，并修复它的搜索表单死代码：
 * 老前端收集 keyword/status 却从不传给 findByPage，本实现中 keyword 真正进入
 * 请求 bean（username/cnName 同值 → 后端 OR-like）。
 *
 * 后端契约（r4 P1-2 实测 backend-ro）：
 * - UserQueryRequest.enabled 声明了但 request2Query 丢弃（UserQuery/BaseUserQuery
 *   无 enabled 字段，只有 validStatus），findByPage 无条件 eq validStatus=VALID
 *   （UserServiceImpl.java:150），故状态筛选不再发送 bean.enabled；
 * - UserResponse.enabled 无映射恒为空，列表只含有效用户，状态列诚实展示"启用"；
 * - 行操作只保留"禁用"（invalidUser → validStatus=INVALID，禁用后不再出现在列表，
 *   当前无恢复入口）；"启用"按钮不可达，已删除。
 * - 删除（deleteUser）后端走 deactivateUser 逻辑停用，与禁用同路径，非物理删除。
 *
 * 列：用户名 / 姓名 / 邮箱 / 手机 / 部门 / 管理员 / 状态 / 最后登录 / 操作。
 * 行操作：编辑（user-form-dialog 弹窗）、分配角色（跳 p5-user-roles 路由）、
 * 禁用、删除（二次确认）。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Chip, Input, Spinner } from "@heroui/react";
import { toast } from "sonner";
import { AppModal, EmptyHint, OptionSelect, PageHeading } from "@/components/biz";
import { UserFormDialog } from "@/components/pm/user-form-dialog";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import {
  toUserMessage,
  useDeleteUser,
  useInvalidUser,
  useUserList,
  type UserEnabledFilter,
} from "@/lib/query";
import { notifyPmChange } from "@/lib/pm/feedback";
import type { UserResponse } from "@/lib/api/system-types";

const PAGE_SIZE = 20;

// r4 P1-2：后端 findByPage 只返回 validStatus=VALID 的用户，"禁用"筛选在后端
// 无语义（enabled 被 request2Query 丢弃），去掉该筛选项避免误导。
const ENABLED_OPTIONS = [
  { id: "all", label: "全部状态" },
  { id: "enabled", label: "启用" },
] as const;

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  // 后端格式 'YYYY-MM-DDTHH:mm:ss'，展示时把 T 换成空格
  return value.replace("T", " ");
}

export function UserListLive() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  // 与 /sys/users 布局路由守卫共用同一判定函数（r4 P1-1）：组件内做二次兜底。
  const authorities = useAuthStore((state) => state.user?.authorities);

  const [keyword, setKeyword] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<UserEnabledFilter>("all");
  // 提交态：只有点"搜索"才真正发请求，避免每次敲字都换 queryKey
  const [submitted, setSubmitted] = useState<{ keyword: string; enabledFilter: UserEnabledFilter }>({
    keyword: "",
    enabledFilter: "all",
  });
  const [page, setPage] = useState(1);
  // 删除二次确认的目标用户
  const [deleteTarget, setDeleteTarget] = useState<UserResponse | null>(null);
  const [disableTarget, setDisableTarget] = useState<UserResponse | null>(null);
  // 新建/编辑弹窗：userId=null 为新建，否则编辑该用户（p5-user-form）
  const [formTarget, setFormTarget] = useState<{ open: boolean; userId: number | null }>({
    open: false,
    userId: null,
  });

  const { data, isLoading, isError, error, refetch, isRefetching } = useUserList({
    page,
    pageSize: PAGE_SIZE,
    keyword: submitted.keyword,
    enabledFilter: submitted.enabledFilter,
  });

  const invalidUser = useInvalidUser();
  const deleteUser = useDeleteUser();

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 页码越界（删除/禁用导致当前页变空）时自动回到最后一页；effect 无条件调用。
  // r4 pi NOTE F7：total=0 时页码同样可能越界（如删光第 2 页后），去掉 total > 0 守卫。
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
    setSubmitted({ keyword, enabledFilter });
    setPage(1);
  };
  const handleReset = () => {
    setKeyword("");
    setEnabledFilter("all");
    setSubmitted({ keyword: "", enabledFilter: "all" });
    setPage(1);
  };

  // r4 P1-2：列表只含 validStatus=VALID 的用户（后端硬编码），"启用"不可达；
  // 只保留"禁用"（invalidUser → validStatus=INVALID），后果在文案中明确。
  const handleDisable = () => {
    if (!disableTarget) return;
    const target = disableTarget;
    invalidUser.mutate(target.id, {
      onSuccess: () => {
        notifyPmChange(`已禁用用户 ${target.username ?? target.id}`);
        setDisableTarget(null);
      },
      // r4 P2-6：失败分支不用成功语通知，改用 error toast。
      onError: (err) => {
        toast.error(`禁用失败：${toUserMessage(err)}`);
        setDisableTarget(null);
      },
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    deleteUser.mutate(target.id, {
      onSuccess: () => {
        notifyPmChange(`已删除用户 ${target.username ?? target.id}`);
        setDeleteTarget(null);
      },
      // r4 P2-6：失败分支不用成功语通知，改用 error toast。
      onError: (err) => {
        toast.error(`删除失败：${toUserMessage(err)}`);
        setDeleteTarget(null);
      },
    });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title="用户管理" hint="系统管理员：用户列表、新建、编辑、禁用、删除；分配角色在行内操作。禁用/删除后用户不再出现在列表中，当前无恢复入口。" />
        <Button
          variant="primary"
          onPress={() => {
            setFormTarget({ open: true, userId: null });
          }}
        >
          新增用户
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-surface p-3">
        <Input
          aria-label="搜索关键词"
          placeholder="用户名或姓名"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="max-w-56"
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSearch();
          }}
        />
        <div className="w-44">
          <OptionSelect
            label="用户状态"
            value={enabledFilter}
            options={ENABLED_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            onChange={(id) => setEnabledFilter(id as UserEnabledFilter)}
          />
        </div>
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
          正在从后端加载用户…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-3 py-8 text-sm text-danger">
          <span>加载失败：{toUserMessage(error, "加载用户列表失败")}</span>
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
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface text-left text-default-600">
                  <th className="px-3 py-2 font-medium">用户名</th>
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">邮箱</th>
                  <th className="px-3 py-2 font-medium">手机</th>
                  <th className="px-3 py-2 font-medium">部门</th>
                  <th className="px-3 py-2 font-medium">管理员</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">最后登录</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {(data?.list ?? []).map((user) => (
                  <tr key={user.id} className="border-t border-border hover:bg-surface">
                    <td className="px-3 py-2 font-medium">{user.username ?? "—"}</td>
                    <td className="px-3 py-2">{user.cnName ?? "—"}</td>
                    <td className="px-3 py-2">{user.email ?? "—"}</td>
                    <td className="px-3 py-2">{user.phone ?? "—"}</td>
                    <td className="px-3 py-2">{user.departmentName ?? "—"}</td>
                    <td className="px-3 py-2">
                      {user.admin ? (
                        <Chip size="sm" color="warning" variant="soft">
                          管理员
                        </Chip>
                      ) : (
                        <span className="text-default-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {/* r4 P1-2：后端 findByPage 只返回 validStatus=VALID 的用户，
                          UserResponse.enabled 无映射恒为空；诚实展示为"启用"。 */}
                      <Chip size="sm" color="success" variant="soft">
                        启用
                      </Chip>
                    </td>
                    <td className="px-3 py-2 text-default-600">{formatDateTime(user.lastLoginTime)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            setFormTarget({ open: true, userId: user.id });
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => {
                            void navigate({ to: "/sys/users/$userId/roles", params: { userId: String(user.id) } });
                          }}
                        >
                          分配角色
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={invalidUser.isPending}
                          onPress={() => setDisableTarget(user)}
                        >
                          禁用
                        </Button>
                        <Button
                          size="sm"
                          variant="danger-soft"
                          onPress={() => setDeleteTarget(user)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.list ?? []).length === 0 && total === 0 ? (
              <p className="py-8 text-center text-sm text-default-500">暂无用户</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="type-meta">
              共 {total} 个用户 · 第 {page} / {totalPages} 页
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

      <UserFormDialog
        open={formTarget.open}
        userId={formTarget.userId}
        onClose={() => setFormTarget({ open: false, userId: null })}
      />

      <AppModal
        open={disableTarget != null}
        title="禁用用户"
        size="sm"
        onClose={() => setDisableTarget(null)}
      >
        <p className="text-sm">
          确定要禁用用户 <span className="font-medium">{disableTarget?.username ?? disableTarget?.id}</span> 吗？
          禁用后该用户将不再出现在列表中，当前无恢复入口。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setDisableTarget(null)}>
            取消
          </Button>
          <Button variant="danger" isDisabled={invalidUser.isPending} onPress={handleDisable}>
            确定禁用
          </Button>
        </div>
      </AppModal>

      <AppModal
        open={deleteTarget != null}
        title="删除用户"
        size="sm"
        onClose={() => setDeleteTarget(null)}
      >
        <p className="text-sm">
          确定要删除用户 <span className="font-medium">{deleteTarget?.username ?? deleteTarget?.id}</span> 吗？
          {/* r4 P1-4：以后端实际为准——deleteUser 走 deactivateUser 逻辑停用，
              与禁用效果相同；删掉"软删除、可在后续切片中恢复"的不实承诺。 */}
          删除将停用该用户（与禁用效果相同），用户将不再出现在列表中，当前无恢复入口。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onPress={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button variant="danger" isDisabled={deleteUser.isPending} onPress={handleDelete}>
            确定删除
          </Button>
        </div>
      </AppModal>
    </div>
  );
}
