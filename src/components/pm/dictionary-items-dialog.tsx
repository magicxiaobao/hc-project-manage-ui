import { useRef, useState } from "react";
import { Button } from "@heroui/react";
import { AppModal } from "@/components/biz";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import {
  dictionaryStatusAction,
  dictionaryStatusLabel,
  isDictionaryId,
} from "@/lib/dictionary-query";
import {
  toUserMessage,
  useDictionaryDetail,
  useDictionaryItems,
  useValidDictionaryItem,
  useInvalidDictionaryItem,
} from "@/lib/query";
import { DictionaryItemFormDialog } from "./dictionary-item-form-dialog";

export function DictionaryItemsDialog({
  open,
  dictId,
  onClose,
}: {
  open: boolean;
  dictId: number | null;
  onClose: () => void;
}) {
  const allowed = useAuthStore(
    (state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities),
  );
  const dictionary = useDictionaryDetail(dictId, open);
  const items = useDictionaryItems(dictId, open);
  const valid = useValidDictionaryItem();
  const invalid = useInvalidDictionaryItem();
  const [editing, setEditing] = useState<{ dictId: number; itemId: number | null } | null>(null);
  const childOpen = open && editing?.dictId === dictId;
  const childExit = useRef<((action: () => void) => void) | null>(null);
  const [operationError, setOperationError] = useState<{
    dictId: number | null;
    message: string;
  } | null>(null);
  const busy = useRef(false);
  const identity = useRef({ open, dictId });
  identity.current = { open, dictId };
  const close = () => {
    if (busy.current) return;
    const action = () => {
      setEditing(null);
      onClose();
    };
    if (childOpen) childExit.current?.(action);
    else action();
  };
  const edit = (itemId: number | null) => {
    if (!isDictionaryId(dictId)) return;
    const action = () => setEditing({ dictId, itemId });
    if (childOpen) childExit.current?.(action);
    else action();
  };
  const changeStatus = async (id: number, status: unknown) => {
    const action = dictionaryStatusAction(status);
    if (!allowed || busy.current || childOpen || !isDictionaryId(id) || action === null) return;
    busy.current = true;
    setOperationError(null);
    const context = identity.current;
    try {
      await (action === "valid" ? valid : invalid).mutateAsync(id);
    } catch (error) {
      if (context.open === identity.current.open && context.dictId === identity.current.dictId)
        setOperationError({ dictId, message: toUserMessage(error) });
    } finally {
      busy.current = false;
    }
  };
  const working = valid.isPending || invalid.isPending;
  return (
    <>
      <AppModal
        open={open}
        title={`字典项管理 · ${dictionary.data?.title ?? dictionary.data?.code ?? `#${dictId}`}`}
        onClose={close}
        size="cover"
      >
        {!allowed ? (
          <p>需要系统管理员权限</p>
        ) : !isDictionaryId(dictId) ? (
          <p role="alert">字典 ID 无效</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p>
              所属字典：{dictionary.data?.code ?? "—"} / {dictionary.data?.title ?? "—"}
            </p>
            {dictionary.isError ? (
              <div>
                <p role="alert">字典详情加载失败：{toUserMessage(dictionary.error)}</p>
                <Button
                  onPress={() => {
                    void dictionary.refetch();
                  }}
                >
                  重试字典详情
                </Button>
              </div>
            ) : null}
            {items.isError ? (
              <div>
                <p role="alert">
                  字典项加载失败：{toUserMessage(items.error)}
                  {items.data ? "；保留上次结果" : ""}
                </p>
                <Button
                  isDisabled={items.isFetching}
                  onPress={() => {
                    void items.refetch();
                  }}
                >
                  重试
                </Button>
              </div>
            ) : null}
            {operationError?.dictId === dictId ? (
              <p role="alert">操作失败：{operationError.message}</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="primary"
                isDisabled={!dictionary.data || dictionary.isError || working || childOpen}
                onPress={() => edit(null)}
              >
                新增字典项
              </Button>
              <Button
                isDisabled={items.isFetching || childOpen}
                onPress={() => {
                  void items.refetch();
                }}
              >
                刷新
              </Button>
            </div>
            {items.isLoading ? <p role="status">正在加载字典项…</p> : null}
            {items.data?.length === 0 ? <p>暂无字典项</p> : null}
            {items.data && items.data.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full text-sm" aria-label="字典项列表">
                  <thead>
                    <tr>
                      {[
                        "数据值",
                        "显示文本",
                        "排序",
                        "附加属性",
                        "状态",
                        "备注",
                        "创建时间（原始值）",
                        "更新时间（原始值）",
                        "操作",
                      ].map((h) => (
                        <th key={h} className="p-2 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.data.map((row, index) => {
                      const action = dictionaryStatusAction(row.validStatus);
                      const usable = isDictionaryId(row.id) && row.dictId === dictId;
                      return (
                        <tr key={`${row.id}:${index}`}>
                          <td className="p-2">{row.value ?? "—"}</td>
                          <td>{row.name ?? "—"}</td>
                          <td>{row.sort ?? "—"}</td>
                          <td>
                            <pre>
                              {row.attributes == null
                                ? "—"
                                : JSON.stringify(row.attributes, null, 2)}
                            </pre>
                          </td>
                          <td>{dictionaryStatusLabel(row.validStatus)}</td>
                          <td>{row.memo ?? "—"}</td>
                          <td>{row.createdAt ?? "—"}</td>
                          <td>{row.updatedAt ?? "—"}</td>
                          <td>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                isDisabled={
                                  !usable ||
                                  !dictionary.data ||
                                  dictionary.isError ||
                                  childOpen ||
                                  working
                                }
                                onPress={() => edit(row.id)}
                              >
                                编辑
                              </Button>
                              {action ? (
                                <Button
                                  size="sm"
                                  isDisabled={!usable || childOpen || working}
                                  onPress={() => {
                                    void changeStatus(row.id, row.validStatus);
                                  }}
                                >
                                  {action === "valid" ? "启用" : "禁用"}
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
            <div className="flex justify-end">
              <Button variant="ghost" onPress={close} isDisabled={working}>
                返回
              </Button>
            </div>
          </div>
        )}
      </AppModal>
      <DictionaryItemFormDialog
        open={childOpen}
        itemId={editing?.itemId ?? null}
        dictionary={dictionary.data?.id === dictId ? dictionary.data : undefined}
        onClose={() => setEditing(null)}
        exitRef={childExit}
      />
    </>
  );
}
