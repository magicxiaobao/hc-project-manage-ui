import { useRef, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import {
  dictionaryListParams,
  searchDictionaries,
  dictionaryStatusAction,
  dictionaryStatusLabel,
  dictionaryValueTypeLabel,
  isDictionaryId,
} from "@/lib/dictionary-query";
import {
  dictionaryHashBatch,
  dictionaryHashResultLabel,
  dictionaryHashSessionMatches,
} from "@/lib/dictionary-hash";
import {
  queryKeys,
  toUserMessage,
  useDictionaryList,
  useValidDictionary,
  useInvalidDictionary,
  useBatchValidateDictionaryHashCode,
  useDictionaryHashCode,
  useValidateDictionaryHashCode,
} from "@/lib/query";
import { DictionaryFormDialog } from "./dictionary-form-dialog";
import { DictionaryItemsDialog } from "./dictionary-items-dialog";

export function DictionaryListLive() {
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const [filters, setFilters] = useState({ code: "", title: "" });
  const [params, setParams] = useState(() => dictionaryListParams());
  const list = useDictionaryList(params);
  const valid = useValidDictionary();
  const invalid = useInvalidDictionary();
  const batch = useBatchValidateDictionaryHashCode();
  const single = useValidateDictionaryHashCode();
  const client = useQueryClient();
  const [form, setForm] = useState<{ id: number | null } | null>(null);
  const [managing, setManaging] = useState<number | null>(null);
  const [operationError, setOperationError] = useState("");
  const [hashError, setHashError] = useState<{
    identity: string;
    session: number;
    message: string;
  } | null>(null);
  const [hashNotice, setHashNotice] = useState("");
  const [hashResults, setHashResults] = useState<{
    identity: string;
    results: Record<string, boolean>;
    session: number;
  } | null>(null);
  const key = queryKeys.system.list({ kind: "dictionaryList", ...params });
  const pageKey = JSON.stringify(params);
  const identity = `${pageKey}:${list.dataUpdatedAt}:${list.isFetching}:${allowed}`;
  const currentIdentity = useRef(identity);
  const hashSession = useRef(0);
  const noticeSession = useRef(0);
  const pageRevision = useRef(0);
  if (currentIdentity.current !== identity) {
    currentIdentity.current = identity;
    pageRevision.current += 1;
    hashSession.current += 1;
  }
  const [readHash, setReadHash] = useState<{
    identity: string;
    revision: number;
    code: string;
  } | null>(null);
  const hash = useDictionaryHashCode(
    readHash?.code ?? "",
    readHash?.identity === identity && readHash.revision === pageRevision.current,
  );
  const actionBusy = useRef(false);
  const hashBusy = useRef(false);
  const working = valid.isPending || invalid.isPending;
  const inspecting = batch.isPending || single.isPending;
  const locked = form !== null || managing !== null || working;
  const records = list.data?.list ?? [];
  const hashes = dictionaryHashBatch(records);
  const canCheck = Object.keys(hashes).length > 0;
  const changeStatus = async (id: number, status: unknown) => {
    const action = dictionaryStatusAction(status);
    if (!allowed || actionBusy.current || locked || !isDictionaryId(id) || action === null) return;
    actionBusy.current = true;
    hashSession.current += 1;
    noticeSession.current += 1;
    setHashResults(null);
    setHashNotice("");
    setOperationError("");
    try {
      await (action === "valid" ? valid : invalid).mutateAsync(id);
    } catch (error) {
      setOperationError(toUserMessage(error));
    } finally {
      actionBusy.current = false;
    }
  };
  const checkHash = async (code?: string) => {
    if (
      !allowed ||
      locked ||
      inspecting ||
      hashBusy.current ||
      list.isFetching ||
      (!code && !canCheck)
    )
      return;
    const request = code ? Object.fromEntries([[code, hash.data ?? ""]]) : hashes;
    if (code && (!hash.data?.trim() || hash.isFetching || hash.isError)) return;
    const submittedIdentity = identity;
    const submittedVersion = list.dataUpdatedAt;
    const session = ++hashSession.current;
    const notice = ++noticeSession.current;
    hashBusy.current = true;
    setHashError(null);
    setHashResults(null);
    setHashNotice("");
    const current = () =>
      dictionaryHashSessionMatches(
        submittedIdentity,
        currentIdentity.current,
        session,
        hashSession.current,
      ) &&
      client.getQueryState(key)?.dataUpdatedAt === submittedVersion &&
      client.getQueryState(key)?.fetchStatus !== "fetching" &&
      !client.getQueryState(key)?.isInvalidated;
    try {
      const results = code
        ? { [code]: await single.mutateAsync({ code, hashCode: request[code] }) }
        : await batch.mutateAsync(request);
      if (!current()) return;
      setHashResults({ identity, session, results });
      if (Object.values(results).some((value) => value === false)) {
        setHashNotice("发现不匹配，正在重取最新数据…");
        await client.invalidateQueries({ queryKey: queryKeys.system.all });
        // Own refetch revokes hash results. Only report success for this same page.
        if (notice === noticeSession.current && currentIdentity.current.startsWith(`${pageKey}:`)) {
          setHashNotice(
            client.getQueryState(key)?.error
              ? "发现不匹配；数据重取失败，请重试"
              : "发现不匹配，已更新为重取的最新数据",
          );
        }
      }
    } catch (error) {
      if (current()) setHashError({ identity, session, message: toUserMessage(error) });
    } finally {
      hashBusy.current = false;
    }
  };
  const apply = (reset = false) => {
    const next = reset ? { code: "", title: "" } : filters;
    if (reset) setFilters(next);
    hashSession.current += 1;
    noticeSession.current += 1;
    setHashResults(null);
    setHashError(null);
    setHashNotice("");
    setReadHash(null);
    setParams(searchDictionaries(next, params.pageSize));
    if (JSON.stringify(searchDictionaries(next, params.pageSize)) === pageKey) void list.refetch();
  };
  if (!allowed) return <p className="p-6">需要系统管理员权限，字典管理及有效字典查询均不可访问</p>;
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">字典管理</h1>
      <div className="flex flex-wrap items-end gap-3">
        {(["code", "title"] as const).map((field) => (
          <TextField
            key={field}
            value={filters[field]}
            onChange={(value) => setFilters((f) => ({ ...f, [field]: value }))}
            aria-label={field === "code" ? "编码筛选" : "名称筛选"}
          >
            <Label>{field === "code" ? "编码" : "名称"}</Label>
            <Input />
          </TextField>
        ))}
        <Button isDisabled={locked} onPress={() => apply()}>
          搜索
        </Button>
        <Button isDisabled={locked} onPress={() => apply(true)}>
          重置
        </Button>
        <Button
          variant="primary"
          isDisabled={locked}
          onPress={() => {
            hashSession.current += 1;
            noticeSession.current += 1;
            setHashResults(null);
            setForm({ id: null });
          }}
        >
          新增字典
        </Button>
      </div>
      <p className="text-sm text-muted">筛选条件提交至服务端，实际筛选效果待联调确认。</p>
      {list.isLoading ? <p role="status">正在加载字典…</p> : null}
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
      {list.data?.list.length === 0 ? <p>暂无字典</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          isDisabled={!canCheck || locked || inspecting || list.isFetching}
          onPress={() => {
            void checkHash();
          }}
        >
          校验当前页缓存
        </Button>
        <Button
          isDisabled={locked || list.isFetching}
          onPress={() => {
            void list.refetch();
          }}
        >
          刷新
        </Button>
        {!canCheck ? <p>当前页没有可校验记录：需有效状态及非空编码、hashCode</p> : null}
      </div>
      {hashError?.identity === identity && hashError.session === hashSession.current ? (
        <p role="alert">校验请求失败：{hashError.message}；请重取数据后重试</p>
      ) : null}
      {hashNotice ? <p role="status">{hashNotice}</p> : null}
      {list.data && records.length > 0 ? (
        <div className="overflow-auto">
          <table className="w-full text-sm" aria-label="字典列表">
            <thead>
              <tr>
                {[
                  "编码",
                  "名称",
                  "数据类型",
                  "状态",
                  "hashCode",
                  "缓存校验",
                  "备注",
                  "创建时间（原始值）",
                  "更新时间（原始值）",
                  "操作",
                ].map((h) => (
                  <th className="p-2 text-left" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((row, index) => {
                const action = dictionaryStatusAction(row.validStatus);
                return (
                  <tr key={`${row.id}:${index}`}>
                    <td className="p-2">{row.code ?? "—"}</td>
                    <td>{row.title ?? "—"}</td>
                    <td>{dictionaryValueTypeLabel(row.valueType)}</td>
                    <td>{dictionaryStatusLabel(row.validStatus)}</td>
                    <td className="break-all">{row.hashCode ?? "—"}</td>
                    <td>
                      {hashResults?.identity === identity &&
                      hashResults.session === hashSession.current &&
                      row.code &&
                      Object.hasOwn(hashes, row.code)
                        ? dictionaryHashResultLabel(hashResults.results, row.code)
                        : "—"}
                    </td>
                    <td>{row.memo ?? "—"}</td>
                    <td>{row.createdAt ?? "—"}</td>
                    <td>{row.updatedAt ?? "—"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          isDisabled={locked || !isDictionaryId(row.id)}
                          onPress={() => {
                            hashSession.current += 1;
                            noticeSession.current += 1;
                            setHashResults(null);
                            setForm({ id: row.id });
                          }}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          isDisabled={locked || !isDictionaryId(row.id)}
                          onPress={() => {
                            hashSession.current += 1;
                            noticeSession.current += 1;
                            setHashResults(null);
                            setManaging(row.id);
                          }}
                        >
                          字典项管理
                        </Button>
                        {action ? (
                          <Button
                            size="sm"
                            isDisabled={locked || !isDictionaryId(row.id)}
                            onPress={() => {
                              void changeStatus(row.id, row.validStatus);
                            }}
                          >
                            {action === "valid" ? "启用" : "禁用"}
                          </Button>
                        ) : null}
                        {row.validStatus === 1 && row.code?.trim() ? (
                          <Button
                            size="sm"
                            isDisabled={locked || list.isFetching || inspecting}
                            onPress={() =>
                              setReadHash({
                                identity,
                                revision: pageRevision.current,
                                code: row.code!,
                              })
                            }
                          >
                            读取 hash
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {readHash?.identity === identity && readHash.revision === pageRevision.current ? (
        <div>
          <p>
            当前服务端 hash（{readHash.code}）：{hash.isLoading ? "加载中…" : (hash.data ?? "—")}
          </p>
          {hash.isError ? <p role="alert">hash 读取失败：{toUserMessage(hash.error)}</p> : null}
          <Button
            isDisabled={hash.isFetching || inspecting}
            onPress={() => {
              void hash.refetch();
            }}
          >
            重取 hash
          </Button>
          <Button
            isDisabled={!hash.data || hash.isFetching || hash.isError || inspecting || locked}
            onPress={() => {
              void checkHash(readHash.code);
            }}
          >
            校验此 hash
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          isDisabled={params.page <= 1 || locked || list.isFetching}
          onPress={() => {
            noticeSession.current += 1;
            setParams((p) => ({ ...p, page: p.page - 1 }));
            setHashNotice("");
          }}
        >
          上一页
        </Button>
        <span>
          第 {params.page} 页 · 共 {list.data?.total ?? "—"} 条 · 每页 {params.pageSize} 条
        </span>
        <Button
          isDisabled={
            !list.data ||
            params.page * params.pageSize >= list.data.total ||
            locked ||
            list.isFetching
          }
          onPress={() => {
            noticeSession.current += 1;
            setParams((p) => ({ ...p, page: p.page + 1 }));
            setHashNotice("");
          }}
        >
          下一页
        </Button>
      </div>
      <DictionaryFormDialog
        open={form !== null}
        dictionaryId={form?.id ?? null}
        onClose={() => setForm(null)}
      />
      <DictionaryItemsDialog
        open={managing !== null}
        dictId={managing}
        onClose={() => setManaging(null)}
      />
    </div>
  );
}
