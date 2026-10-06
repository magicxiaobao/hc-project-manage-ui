import { useQuery } from "@tanstack/react-query";
import { systemApi } from "../../api/system";
import type {
  DictionaryItemCreatePayload,
  DictionaryItemUpdatePayload,
} from "../../api/system-types";
import { requireDictionaryId, isDictionaryId } from "../../dictionary-query";
import { queryKeys } from "../keys";
import {
  assertDictionaryAccess,
  useDictionaryAccess,
  useDictionaryMutation,
} from "./useDictionaries";
export const dictionaryItemsOptions = (dictId: number | null, enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "dictionaryItems", dictId }),
  queryFn: async () => {
    assertDictionaryAccess();
    requireDictionaryId(dictId);
    const records = await systemApi.dictionaryItem.findByDictId(dictId);
    if (records.some((row) => row.dictId !== dictId))
      throw new Error("字典项所属字典不匹配，请重试");
    return records;
  },
  enabled: enabled && isDictionaryId(dictId),
});
export const dictionaryItemDetailOptions = (
  itemId: number | null,
  dictId: number | null,
  enabled: boolean,
) => ({
  queryKey: queryKeys.system.list({ kind: "dictionaryItemDetail", itemId, dictId }),
  queryFn: async () => {
    assertDictionaryAccess();
    requireDictionaryId(itemId);
    requireDictionaryId(dictId);
    const row = await systemApi.dictionaryItem.findById(itemId);
    if (row.id !== itemId || row.dictId !== dictId)
      throw new Error("字典项详情 ID 或所属字典不匹配，请重试");
    return row;
  },
  enabled: enabled && isDictionaryId(itemId) && isDictionaryId(dictId),
});
export const useDictionaryItems = (dictId: number | null, enabled: boolean) =>
  useQuery(dictionaryItemsOptions(dictId, useDictionaryAccess() && enabled));
export const useDictionaryItemDetail = (
  itemId: number | null,
  dictId: number | null,
  enabled: boolean,
) => useQuery(dictionaryItemDetailOptions(itemId, dictId, useDictionaryAccess() && enabled));
export const useCreateDictionaryItem = () =>
  useDictionaryMutation(async (data: DictionaryItemCreatePayload) => {
    requireDictionaryId(data.dictId);
    const id = await systemApi.dictionaryItem.createDictionaryItem(data);
    if (!isDictionaryId(id)) throw new Error("字典项创建未成功：返回 ID 无效，请检查后重试");
    return id;
  });
export const useUpdateDictionaryItem = () =>
  useDictionaryMutation((data: DictionaryItemUpdatePayload) => {
    requireDictionaryId(data.id);
    return systemApi.dictionaryItem.updateDictionaryItem(data);
  });
export const useValidDictionaryItem = () =>
  useDictionaryMutation((id: number) => {
    requireDictionaryId(id);
    return systemApi.dictionaryItem.validDictionaryItem(id);
  });
export const useInvalidDictionaryItem = () =>
  useDictionaryMutation((id: number) => {
    requireDictionaryId(id);
    return systemApi.dictionaryItem.invalidDictionaryItem(id);
  });
export const useCheckDictionaryItemValue = () =>
  useDictionaryMutation(async (data: { dictId: number; value: string }) => {
    requireDictionaryId(data.dictId);
    const exists = await systemApi.dictionaryItem.existsByValue(data.dictId, data.value);
    if (typeof exists !== "boolean") throw new Error("未返回有效的数据值唯一性结果");
    return exists;
  }, false);
