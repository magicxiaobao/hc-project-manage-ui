import { useRef, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { AppModal, OptionSelect } from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import {
  CONFIG_TYPES,
  systemConfigListParams,
  configTypeLabel,
  configEnabledAction,
  configEnabledLabel,
  isSystemConfigId,
} from "@/lib/system-config-query";
import {
  useSystemConfigList,
  useValidSystemConfig,
  useInvalidSystemConfig,
  toUserMessage,
} from "@/lib/query";
import { SystemConfigFormDialog } from "./system-config-form-dialog";
const timeLabel = (seconds: number | null) => {
  if (seconds === null) return "—";
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("zh-CN", { hour12: false })
    : `${seconds}（时间无效）`;
};
export function SystemConfigListLive() {
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const [filters, setFilters] = useState({ configKey: "", configType: "" });
  const [params, setParams] = useState(() => systemConfigListParams());
  const list = useSystemConfigList(params);
  const valid = useValidSystemConfig();
  const invalid = useInvalidSystemConfig();
  const [form, setForm] = useState<{ id: number | null } | null>(null);
  const [raw, setRaw] = useState<{ key: string; value: string } | null>(null);
  const [operationError, setOperationError] = useState("");
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const revision = useRef(0);
  const identity = `${allowed}:${JSON.stringify(params)}`;
  const previous = useRef(identity);
  if (previous.current !== identity) {
    previous.current = identity;
    revision.current += 1;
  }
  const locked = form !== null || working;
  const apply = (reset = false) => {
    if (locked) return;
    const nextFilters = reset ? { configKey: "", configType: "" } : filters;
    if (reset) setFilters(nextFilters);
    const next = systemConfigListParams(1, params.pageSize, nextFilters);
    setParams(next);
    if (JSON.stringify(next) === JSON.stringify(params)) void list.refetch();
  };
  const changeStatus = async (id: number, enabled: unknown) => {
    const action = configEnabledAction(enabled);
    if (!allowed || locked || busy.current || !isSystemConfigId(id) || !action) return;
    busy.current = true;
    setWorking(true);
    setOperationError("");
    const session = revision.current;
    try {
      await (action === "valid" ? valid : invalid).mutateAsync(id);
    } catch (error) {
      if (session === revision.current) setOperationError(toUserMessage(error));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  };
  return (
    <>
      <SystemConfigFormDialog
        open={allowed && form !== null}
        configId={form?.id ?? null}
        onClose={() => setForm(null)}
      />
      {!allowed ? (
        <p className="p-6">需要系统管理员权限，系统配置管理及按类型读取均不可访问</p>
      ) : (
        <div className="flex flex-col gap-4 p-6">
          <h1 className="text-xl font-semibold">系统配置管理</h1>
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              aria-label="配置键筛选"
              value={filters.configKey}
              onChange={(configKey) => setFilters((f) => ({ ...f, configKey }))}
              isDisabled={locked}
            >
              <Label>配置键</Label>
              <Input
                onKeyDown={(event) => {
                  if (event.key === "Enter") apply();
                }}
              />
            </TextField>
            <OptionSelect
              label="类型筛选"
              value={filters.configType}
              options={[{ id: "", label: "全部类型" }, ...CONFIG_TYPES]}
              onChange={(configType) => setFilters((f) => ({ ...f, configType }))}
              isDisabled={locked}
            />
            <Button isDisabled={locked} onPress={() => apply()}>
              搜索
            </Button>
            <Button isDisabled={locked} onPress={() => apply(true)}>
              重置
            </Button>
            <Button variant="primary" isDisabled={locked} onPress={() => setForm({ id: null })}>
              新增配置
            </Button>
          </div>
          <p className="text-sm text-muted">筛选条件提交至服务端，实际筛选效果待联调确认。</p>
          {list.isLoading ? <p role="status">正在加载配置…</p> : null}
          {list.isError ? (
            <div>
              <p role="alert">
                加载失败：{toUserMessage(list.error)}
                {list.data ? "；保留上次结果" : ""}
              </p>
              <Button
                isDisabled={list.isFetching}
                onPress={() => {
                  void list.refetch();
                }}
              >
                重试
              </Button>
            </div>
          ) : null}
          {operationError ? <p role="alert">操作失败：{operationError}</p> : null}
          {list.isSuccess && list.data?.list.length === 0 ? <p>暂无配置</p> : null}
          {list.data ? (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      "名称",
                      "配置键",
                      "类型",
                      "配置值摘要",
                      "描述",
                      "启用状态",
                      "创建时间",
                      "更新时间",
                      "操作",
                    ].map((label) => (
                      <th className="p-2 text-left" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.data.list.map((row, index) => (
                    <tr key={`${row.id}:${index}`}>
                      <td className="p-2">{row.name ?? "—"}</td>
                      <td>{row.configKey ?? "—"}</td>
                      <td>{configTypeLabel(row.configType)}</td>
                      <td className="max-w-64 break-all">
                        {row.configValue === null ? (
                          "—"
                        ) : row.configValue.length > 80 ? (
                          <>
                            {row.configValue.slice(0, 80)}…
                            <Button
                              size="sm"
                              onPress={() =>
                                setRaw({ key: row.configKey ?? "—", value: row.configValue! })
                              }
                            >
                              查看原文
                            </Button>
                          </>
                        ) : (
                          row.configValue
                        )}
                      </td>
                      <td>{row.description ?? "—"}</td>
                      <td>{configEnabledLabel(row.enabled)}</td>
                      <td>{timeLabel(row.createdAt)}</td>
                      <td>{timeLabel(row.updatedAt)}</td>
                      <td>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            isDisabled={locked || !isSystemConfigId(row.id)}
                            onPress={() => {
                              if (!locked) setForm({ id: row.id });
                            }}
                          >
                            编辑
                          </Button>
                          {configEnabledAction(row.enabled) ? (
                            <Button
                              size="sm"
                              isDisabled={locked || !isSystemConfigId(row.id)}
                              onPress={() => {
                                void changeStatus(row.id, row.enabled);
                              }}
                            >
                              {row.enabled === true ? "禁用" : "启用"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              isDisabled={params.page <= 1 || locked || list.isFetching}
              onPress={() => setParams((p) => ({ ...p, page: p.page - 1 }))}
            >
              上一页
            </Button>
            <span>
              第 {params.page} 页 · 共 {list.data?.total ?? "—"} 条 · 每页 {params.pageSize} 条
            </span>
            <Button
              isDisabled={
                locked ||
                list.isFetching ||
                !list.data ||
                params.page * params.pageSize >= list.data.total
              }
              onPress={() => setParams((p) => ({ ...p, page: p.page + 1 }))}
            >
              下一页
            </Button>
            <OptionSelect
              label="每页条数"
              value={String(params.pageSize)}
              options={[10, 20, 50].map((value) => ({ id: String(value), label: String(value) }))}
              isDisabled={locked}
              onChange={(value) => setParams((p) => ({ ...p, page: 1, pageSize: Number(value) }))}
            />
          </div>
          <AppModal
            open={raw !== null}
            title={`配置原文：${raw?.key ?? ""}`}
            onClose={() => setRaw(null)}
          >
            <pre className="whitespace-pre-wrap break-all">{raw?.value}</pre>
          </AppModal>
        </div>
      )}
    </>
  );
}
