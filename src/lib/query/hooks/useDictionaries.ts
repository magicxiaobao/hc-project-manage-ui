import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { systemApi } from "../../api/system";
import type { DictionaryCreatePayload, DictionaryUpdatePayload } from "../../api/system-types";
import { hasSystemAdmin, useAuthStore } from "../../api/auth-store";
import {
  dictionaryListParams,
  requireDictionaryId,
  isDictionaryId,
  type DictionaryListParams,
} from "../../dictionary-query";
import { queryKeys } from "../keys";
export function useDictionaryAccess() {
  return useAuthStore((state) => state.isAuthenticated && hasSystemAdmin(state.user?.authorities));
}
export function assertDictionaryAccess() {
  const state = useAuthStore.getState();
  if (!state.isAuthenticated || !hasSystemAdmin(state.user?.authorities))
    throw new Error("需要系统管理员权限");
}
export const dictionaryListOptions = (params: DictionaryListParams, enabled: boolean) => {
  const request = dictionaryListParams(params.page, params.pageSize, params.bean);
  return {
    queryKey: queryKeys.system.list({ kind: "dictionaryList", ...request }),
    queryFn: () => {
      assertDictionaryAccess();
      return systemApi.dictionary.findByPage(request);
    },
    enabled,
  };
};
export const dictionaryDetailOptions = (dictionaryId: number | null, enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "dictionaryDetail", dictionaryId }),
  queryFn: async () => {
    assertDictionaryAccess();
    requireDictionaryId(dictionaryId);
    const row = await systemApi.dictionary.findById(dictionaryId);
    if (row.id !== dictionaryId) throw new Error("字典详情 ID 不匹配，请重试");
    return row;
  },
  enabled: enabled && isDictionaryId(dictionaryId),
});
export const validDictionariesOptions = (enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "validDictionaries" }),
  queryFn: () => {
    assertDictionaryAccess();
    return systemApi.dictionary.getAllValidDictionaries();
  },
  enabled,
});
export const dictionaryHashCodeOptions = (code: string, enabled: boolean) => ({
  queryKey: queryKeys.system.list({ kind: "dictionaryHashCode", code }),
  queryFn: () => {
    assertDictionaryAccess();
    return systemApi.dictionary.getHashCode(code);
  },
  enabled: enabled && !!code.trim(),
});
export const useDictionaryList = (params: DictionaryListParams, enabled = true) =>
  useQuery(dictionaryListOptions(params, useDictionaryAccess() && enabled));
export const useDictionaryDetail = (id: number | null, enabled: boolean) =>
  useQuery(dictionaryDetailOptions(id, useDictionaryAccess() && enabled));
export function useValidDictionaries(enabled = true) {
  const accessible = useDictionaryAccess();
  return { ...useQuery(validDictionariesOptions(accessible && enabled)), accessible };
}
export const useDictionaryHashCode = (code: string, enabled = false) =>
  useQuery(dictionaryHashCodeOptions(code, useDictionaryAccess() && enabled));
/** Preflight/hash are mutations for fresh, on-demand reads, with no write invalidation. */
export function useDictionaryMutation<T, R>(operation: (data: T) => Promise<R>, write = true) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: T) => {
      assertDictionaryAccess();
      return operation(data);
    },
    onSuccess: () => {
      if (write) void client.invalidateQueries({ queryKey: queryKeys.system.all });
    },
  });
}
export const useCreateDictionary = () =>
  useDictionaryMutation(async (data: DictionaryCreatePayload) => {
    const id = await systemApi.dictionary.createDictionary(data);
    if (!isDictionaryId(id)) throw new Error("字典创建未成功：返回 ID 无效，请检查后重试");
    return id;
  });
export const useUpdateDictionary = () =>
  useDictionaryMutation((data: DictionaryUpdatePayload) => {
    requireDictionaryId(data.id);
    return systemApi.dictionary.updateDictionary(data);
  });
export const useValidDictionary = () =>
  useDictionaryMutation((id: number) => {
    requireDictionaryId(id);
    return systemApi.dictionary.validDictionary(id);
  });
export const useInvalidDictionary = () =>
  useDictionaryMutation((id: number) => {
    requireDictionaryId(id);
    return systemApi.dictionary.invalidDictionary(id);
  });
export const useCheckDictionaryCode = () =>
  useDictionaryMutation(async (code: string) => {
    const exists = await systemApi.dictionary.existsByCode(code);
    if (typeof exists !== "boolean") throw new Error("未返回有效的编码唯一性结果");
    return exists;
  }, false);
export const useValidateDictionaryHashCode = () =>
  useDictionaryMutation(
    (data: { code: string; hashCode: string }) =>
      systemApi.dictionary.validateHashCode(data.code, data.hashCode),
    false,
  );
export const useBatchValidateDictionaryHashCode = () =>
  useDictionaryMutation((data: Record<string, string>) => {
    if (!Object.keys(data).length)
      throw new Error("当前页没有可校验记录：需有效状态及非空编码、hashCode");
    return systemApi.dictionary.batchValidateHashCode(data);
  }, false);
