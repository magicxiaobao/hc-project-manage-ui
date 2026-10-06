import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Input, Spinner } from "@heroui/react";
import { FieldError, useUnsavedChangesGuard } from "@/components/biz/form-guard";
import { RolePermissionTree } from "./role-permission-tree";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import {
  toUserMessage,
  useAssignRolePermissions,
  usePermissionTree,
  useRoleOptions,
  useRolePermissions,
} from "@/lib/query";
import {
  createPermissionSnapshot,
  groupPermissions,
  normalizePermissionIds,
  parseRoleId,
  permissionSnapshotDirty,
  samePermissionIds,
  serializePermissionSelection,
} from "@/lib/role-permissions";
import type { PermissionSnapshot } from "@/lib/role-permissions";

const PAGE_SIZE = 20;

/** URL 参数也是编辑会话标识：旧请求完成后只能更新旧 query，不能写入新会话。 */
export function RolePermissionsPage({ roleId }: { roleId: string }) {
  return <RolePermissionsSession key={roleId} rawRoleId={roleId} />;
}

function RolePermissionsSession({ rawRoleId }: { rawRoleId: string }) {
  const navigate = useNavigate();
  const roleId = parseRoleId(rawRoleId);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const authorities = useAuthStore((state) => state.user?.authorities);
  const authorized = authenticated && hasSystemAdmin(authorities);
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const options = useRoleOptions(submitted, authorized && roleId !== null);
  const fullOptions = useRoleOptions("", authorized && roleId !== null);
  const role = fullOptions.data?.find(
    (candidate) => candidate.id === roleId && candidate.enabled === true,
  );
  const roleAvailable = authorized && !!role && !fullOptions.isError;
  const tree = usePermissionTree(roleAvailable);
  const assigned = useRolePermissions(roleId, roleAvailable);
  const assign = useAssignRolePermissions();
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [operation, setOperation] = useState<"saving" | "verifying" | "reloading" | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const submittedIds = useRef<number[] | null>(null);
  // ref 门禁在事件入口即冻结，防止 React 提交前的连续点击产生两次 POST。
  const busyRef = useRef(false);
  const alive = useRef(true);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const busy = operation !== null || assign.isPending;
  const dirty = permissionSnapshotDirty(snapshot);
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(dirty);

  const treeView = useMemo(() => {
    try {
      if (tree.data === undefined) {
        return { groups: null, error: tree.isSuccess ? "尚未取得可分配权限数据" : "" };
      }
      return { groups: groupPermissions(tree.data), error: "" };
    } catch (error) {
      return { groups: null, error: toUserMessage(error) };
    }
  }, [tree.data, tree.isSuccess]);
  const assignedError = useMemo(() => {
    try {
      if (assigned.data === undefined) return assigned.isSuccess ? "尚未取得权限回显" : "";
      normalizePermissionIds(assigned.data);
      return "";
    } catch (error) {
      return toUserMessage(error);
    }
  }, [assigned.data, assigned.isSuccess]);
  const dataError = treeView.error || assignedError;
  const emptyTree = treeView.groups?.length === 0;
  const loadError = tree.isError ? tree.error : assigned.isError ? assigned.error : null;
  const dataReady =
    roleAvailable && tree.isSuccess && assigned.isSuccess && !dataError && !emptyTree;
  useEffect(() => {
    // 初次进入若命中陈旧缓存，等待本轮请求完成；编辑开始后后台更新不重播种。
    if (
      snapshot !== null ||
      busy ||
      !dataReady ||
      !treeView.groups ||
      !assigned.data ||
      fullOptions.isFetching ||
      tree.isFetching ||
      assigned.isFetching
    )
      return;
    setSnapshot(createPermissionSnapshot(treeView.groups, assigned.data));
    setExpanded(new Set(treeView.groups.map((group) => group.key)));
  }, [
    snapshot,
    busy,
    dataReady,
    treeView.groups,
    assigned.data,
    fullOptions.isFetching,
    tree.isFetching,
    assigned.isFetching,
  ]);

  const candidates = (options.data ?? []).filter((candidate) => candidate.enabled === true);
  const totalPages = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  useEffect(() => {
    if (!options.isLoading && page > totalPages) setPage(totalPages);
  }, [options.isLoading, page, totalPages]);
  const editable = !!snapshot && dataReady && !busy;
  const setSelection = (selected: number[]) => {
    if (!editable || busyRef.current) return;
    setSnapshot((current) => (current ? { ...current, selected } : current));
    setSubmitError("");
    setVerificationError("");
    setNotice("");
  };
  const search = () => {
    setSubmitted(keyword.trim());
    setPage(1);
  };
  const goToRole = (id: number) => {
    if (id === roleId || busyRef.current) return;
    guard(() => {
      void navigate({ to: "/sys/roles/$roleId/permissions", params: { roleId: String(id) } });
    });
  };

  /** 回显始终来自显式 GET；失效后的缓存不能充当验证结果。 */
  const verify = async (expected: number[], groups: PermissionSnapshot["groups"]) => {
    try {
      const response = await assigned.refetch({ throwOnError: true });
      if (!alive.current) return;
      if (response.data === undefined) throw new Error("尚未取得权限回显");
      const actual = normalizePermissionIds(response.data);
      setSnapshot(createPermissionSnapshot(groups, actual));
      setVerificationError(
        samePermissionIds(expected, actual) ? "" : "已保存权限与本次提交不一致，请核对",
      );
    } catch (error) {
      if (alive.current)
        setVerificationError(`保存已成功，回显验证失败，请重试：${toUserMessage(error)}`);
    }
  };
  const save = async () => {
    if (!editable || !dirty || busyRef.current || !snapshot || roleId === null) return;
    let permissionIds: number[];
    try {
      permissionIds = serializePermissionSelection(snapshot);
    } catch (error) {
      setSubmitError(toUserMessage(error));
      return;
    }
    busyRef.current = true;
    setOperation("saving");
    setSubmitError("");
    setNotice("");
    setVerificationError("");
    try {
      await assign.mutateAsync({ roleId, permissionIds });
    } catch (error) {
      if (alive.current) {
        setSubmitError(`保存失败：${toUserMessage(error)}`);
        setOperation(null);
        busyRef.current = false;
      }
      return;
    }
    if (!alive.current) return;
    // POST 成功即建立已保存基线，后续 GET 失败不伪装成保存失败。
    submittedIds.current = permissionIds;
    markClean();
    setSnapshot(createPermissionSnapshot(snapshot.groups, permissionIds));
    setNotice("权限分配成功");
    setOperation("verifying");
    await verify(permissionIds, snapshot.groups);
    if (alive.current) {
      setOperation(null);
      busyRef.current = false;
    }
  };
  const retryVerification = () => {
    if (busyRef.current || !snapshot || !submittedIds.current || !roleAvailable) return;
    const groups = snapshot.groups;
    const expected = submittedIds.current;
    guard(() => {
      busyRef.current = true;
      setOperation("verifying");
      // 放弃确认后先回到干净态，确保重取后的新编辑重新布防。
      setSnapshot(createPermissionSnapshot(groups, expected));
      void verify(expected, groups).finally(() => {
        if (alive.current) {
          setOperation(null);
          busyRef.current = false;
        }
      });
    });
  };
  const reload = () => {
    if (busyRef.current || !roleAvailable) return;
    guard(() => {
      busyRef.current = true;
      setOperation("reloading");
      setSnapshot(null);
      setSubmitError("");
      setVerificationError("");
      setNotice("");
      void Promise.all([
        tree.refetch({ throwOnError: true }),
        assigned.refetch({ throwOnError: true }),
      ])
        .then(([permissions, ids]) => {
          if (!alive.current) return;
          const groups = groupPermissions(permissions.data ?? []);
          if (groups.length === 0) return;
          if (ids.data === undefined) throw new Error("尚未取得权限回显");
          setSnapshot(createPermissionSnapshot(groups, ids.data));
          setExpanded(new Set(groups.map((group) => group.key)));
        })
        .catch((error) => {
          if (alive.current) setSubmitError(`重载失败：${toUserMessage(error)}`);
        })
        .finally(() => {
          if (alive.current) {
            setOperation(null);
            busyRef.current = false;
          }
        });
    });
  };

  return (
    <>
      {dialog}
      {blocker}
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">角色权限分配</h1>
          <Button
            variant="ghost"
            onPress={() =>
              guard(() => {
                void navigate({ to: "/sys/roles" });
              })
            }
          >
            返回角色列表
          </Button>
        </div>
        {!authorized ? (
          <p role="alert">该操作需要系统管理员权限。当前后端管理接口尚不支持细粒度权限。</p>
        ) : roleId === null ? (
          <p role="alert">角色 ID 无效：必须为规范正十进制的安全整数。</p>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-[1fr_2fr]">
            <aside aria-label="角色列表" className="space-y-3 rounded-sm border border-border p-3">
              <div className="flex gap-2">
                <Input
                  aria-label="搜索角色"
                  placeholder="角色名称或编码"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") search();
                  }}
                />
                <Button variant="primary" onPress={search}>
                  搜索
                </Button>
              </div>
              {options.isLoading && (
                <p>
                  <Spinner size="sm" /> 正在加载角色…
                </p>
              )}
              {options.isError && (
                <div>
                  <FieldError message={`角色搜索失败：${toUserMessage(options.error)}`} />
                  <Button
                    variant="ghost"
                    isDisabled={options.isFetching}
                    onPress={() => {
                      void options.refetch();
                    }}
                  >
                    重试角色搜索
                  </Button>
                </div>
              )}
              <ul className="space-y-2">
                {candidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      aria-current={candidate.id === roleId ? "true" : undefined}
                      disabled={busy}
                      onClick={() => goToRole(candidate.id)}
                      className={`w-full rounded-sm border p-3 text-left disabled:opacity-50 ${candidate.id === roleId ? "border-primary bg-primary-soft" : "border-border"}`}
                    >
                      <p className="font-medium">{candidate.roleName ?? "—"}</p>
                      <p className="break-all text-xs text-default-500">
                        {candidate.roleCode ?? "—"}
                      </p>
                      <p className="text-xs text-default-500">{candidate.description ?? "—"}</p>
                    </button>
                  </li>
                ))}
              </ul>
              {!options.isLoading && !options.isError && !candidates.length && (
                <p>没有匹配的启用角色</p>
              )}
              <p className="text-xs">
                共 {candidates.length} 个角色 · 第 {page} / {totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={page <= 1}
                  onPress={() => setPage(page - 1)}
                >
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={page >= totalPages}
                  onPress={() => setPage(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </aside>
            <section
              aria-label="当前角色权限"
              className="space-y-4 rounded-sm border border-border p-4"
            >
              {fullOptions.isLoading && (
                <p>
                  <Spinner size="sm" /> 正在定位当前角色…
                </p>
              )}
              {fullOptions.isError && (
                <div>
                  <FieldError
                    message={`完整角色列表加载失败：${toUserMessage(fullOptions.error)}，保存暂时不可用`}
                  />
                  <Button
                    variant="ghost"
                    isDisabled={fullOptions.isFetching}
                    onPress={() => {
                      void fullOptions.refetch();
                    }}
                  >
                    重试完整角色列表
                  </Button>
                </div>
              )}
              {!fullOptions.isLoading && !fullOptions.isError && !role && (
                <p role="alert">角色不存在或未启用</p>
              )}
              {role && (
                <div>
                  <h2 className="text-lg font-medium">{role.roleName ?? "—"}</h2>
                  <p className="text-sm">
                    {role.roleCode ?? "—"} · {role.description ?? "—"}
                  </p>
                </div>
              )}
              {roleAvailable && !snapshot && !loadError && !dataError && !emptyTree && (
                <p>
                  <Spinner size="sm" /> 正在加载权限回显…
                </p>
              )}
              {loadError && (
                <div>
                  <FieldError message={`权限加载失败：${toUserMessage(loadError)}，草稿保持不变`} />
                  <Button
                    variant="ghost"
                    isDisabled={busy || tree.isFetching || assigned.isFetching}
                    onPress={() => {
                      void tree.refetch();
                      void assigned.refetch();
                    }}
                  >
                    重试权限加载
                  </Button>
                </div>
              )}
              {emptyTree && <p role="alert">暂未取得可分配权限，请重试</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" isDisabled={!editable} onPress={() => setSelection([])}>
                  重置选择
                </Button>
                <Button
                  variant="ghost"
                  isDisabled={!snapshot}
                  onPress={() => setExpanded(new Set(snapshot?.groups.map((group) => group.key)))}
                >
                  展开全部
                </Button>
                <Button
                  variant="ghost"
                  isDisabled={!snapshot}
                  onPress={() => setExpanded(new Set())}
                >
                  收起全部
                </Button>
                <Button variant="ghost" isDisabled={!roleAvailable || busy} onPress={reload}>
                  重新加载
                </Button>
              </div>
              {snapshot && (
                <>
                  {snapshot.hidden.length > 0 && (
                    <p className="text-sm">
                      已有 {snapshot.hidden.length} 项权限不在当前可分配列表，保存时保留
                    </p>
                  )}
                  <RolePermissionTree
                    groups={snapshot.groups}
                    selected={snapshot.selected}
                    expanded={expanded}
                    disabled={!editable}
                    onSelectionChange={setSelection}
                    onExpandedChange={setExpanded}
                  />
                  <p className="text-sm">
                    已选 {snapshot.selected.length} 项可分配权限{dirty ? " · 有未保存修改" : ""}
                  </p>
                </>
              )}
              <FieldError message={treeView.error} />
              <FieldError message={assignedError} />
              <FieldError message={submitError} />
              {notice && (
                <p role="status" className="text-success">
                  {notice}
                </p>
              )}
              {verificationError && (
                <div>
                  <FieldError message={verificationError} />
                  <Button
                    variant="ghost"
                    isDisabled={busy || !roleAvailable}
                    onPress={retryVerification}
                  >
                    重试回显验证
                  </Button>
                </div>
              )}
              <Button
                variant="primary"
                isDisabled={!editable || !dirty}
                onPress={() => {
                  void save();
                }}
              >
                {operation === "saving"
                  ? "保存中…"
                  : operation === "verifying"
                    ? "正在验证回显…"
                    : "保存分配"}
              </Button>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
