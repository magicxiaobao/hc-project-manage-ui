import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { traceabilityRelationApi } from "../../api/trace";
import { taskApi } from "../../api/task";
import { requirementApi } from "../../api/requirement";
import { defectApi } from "../../api/defect";
import { testCaseApi } from "../../api/test-case";
import { useAuthStore } from "../../api/auth-store";
import type {
  AlmObjectKey,
  AlmObjectType,
  AlmRelationType,
  LinkRelationPayload,
  UnlinkRelationPayload,
} from "../../api/trace-types";
import type { PageResult } from "../../api/types";
import {
  isPositiveSafeId,
  normalizeRelationQuery,
  validRelationQuery,
  relationsForObject,
  assertBatchRelations,
  assertRelation,
  relationPayload,
  relationWriteMessage,
} from "../../trace-relations";
import { queryKeys } from "../keys";
import { useTaskList } from "./useTasks";
import { useRequirementList } from "./useRequirements";

export interface RelationCandidate {
  id: number | null;
  projectId: number | null;
  title: string | null;
}
export function useTraceRelations({
  projectId,
  objects,
  contextVerified = false,
  relationTypes = [],
}: {
  projectId: number | null;
  objects: readonly AlmObjectKey[];
  contextVerified?: boolean;
  relationTypes?: readonly AlmRelationType[];
}) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const normalized = normalizeRelationQuery(objects, relationTypes);
  return useQuery({
    queryKey: queryKeys.traceRelation.batch(
      projectId,
      normalized.objects,
      normalized.relationTypes,
    ),
    queryFn: async () => {
      const result = await traceabilityRelationApi.batchQuery(normalized);
      assertBatchRelations(result);
      normalized.objects.forEach((object) => relationsForObject(result, object));
      if (
        result.items.some((item) =>
          [...item.outgoing, ...item.incoming].some((row) => row.projectId !== projectId),
        )
      )
        throw new Error("响应契约错误：关系项目归属不匹配");
      return result;
    },
    enabled: authenticated && validRelationQuery(projectId, normalized.objects, contextVerified),
  });
}
export async function invalidateTraceRelationDomains(client: QueryClient) {
  const results = await Promise.allSettled([
    client.invalidateQueries({ queryKey: queryKeys.traceRelation.all }, { throwOnError: true }),
    client.invalidateQueries(
      {
        predicate: (query) => {
          const [root, domain, kind] = query.queryKey;
          return (
            root === "hc" &&
            domain === "requirement" &&
            ["trace", "impact", "matrix"].includes(String(kind))
          );
        },
      },
      { throwOnError: true },
    ),
  ]);
  if (results.some((result) => result.status === "rejected"))
    toast.error("操作已成功，刷新失败，请重试读取");
}
function useRelationWrite<V extends LinkRelationPayload>(
  mutationFn: (variables: V) => ReturnType<typeof traceabilityRelationApi.link>,
  message: string,
  expectedStatus: "ACTIVE" | "INACTIVE",
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.traceRelation.all,
    mutationFn: async (variables: V) => {
      const result = await mutationFn(variables);
      assertRelation(result);
      const tuple = relationPayload(result);
      if (
        result.status !== expectedStatus ||
        (Object.keys(tuple) as (keyof LinkRelationPayload)[]).some(
          (field) => tuple[field] !== variables[field],
        )
      )
        throw new Error("响应契约错误：写入结果与原关系不一致，请重查关联");
      return result;
    },
    retry: false,
    onSuccess: () => {
      toast.success(message);
      void invalidateTraceRelationDomains(client);
    },
    onError: (error) => toast.error(relationWriteMessage(error)),
  });
}
export const useLinkTraceRelation = () =>
  useRelationWrite<LinkRelationPayload>(traceabilityRelationApi.link, "关联已创建", "ACTIVE");
export const useUnlinkTraceRelation = () =>
  useRelationWrite<UnlinkRelationPayload>(traceabilityRelationApi.unlink, "关联已解除", "INACTIVE");
export function useRefreshTraceRelationDomains() {
  const client = useQueryClient();
  return () => invalidateTraceRelationDomains(client);
}

const titleDomains = {
  TASK: queryKeys.task,
  REQUIREMENT: queryKeys.requirement,
  DEFECT: queryKeys.defect,
  TEST_CASE: queryKeys.testCase,
};
export function useTraceObjectTitle(object: AlmObjectKey, projectId: number, enabled: boolean) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const domain = titleDomains[object.objectType as keyof typeof titleDomains];
  return useQuery({
    queryKey: domain
      ? domain.detail(object.objectId)
      : queryKeys.traceRelation.detail(`${object.objectType}:${object.objectId}`),
    queryFn: async (): Promise<RelationCandidate> => {
      const read = async (): Promise<RelationCandidate> => {
        switch (object.objectType) {
          case "TASK":
            return taskApi.findById(object.objectId);
          case "REQUIREMENT":
            return requirementApi.findById(object.objectId);
          case "DEFECT":
            return defectApi.findById(object.objectId);
          case "TEST_CASE":
            return testCaseApi.findById(object.objectId);
          default:
            throw new Error("该对象类型仅显示编号");
        }
      };
      const result = await read();
      if (
        !result ||
        result.id !== object.objectId ||
        result.projectId !== projectId ||
        !(result.title === null || typeof result.title === "string")
      )
        throw new Error("响应契约错误：对象标题或项目归属不匹配");
      return result;
    },
    enabled:
      authenticated &&
      enabled &&
      !!domain &&
      isPositiveSafeId(projectId) &&
      isPositiveSafeId(object.objectId),
  });
}
function assertCandidatePage(value: PageResult<RelationCandidate>) {
  if (!value || !Array.isArray(value.list) || !Number.isSafeInteger(value.total) || value.total < 0)
    throw new Error("响应契约错误：候选分页无效");
  return value;
}
/** 任务/需求复用既有列表 hooks，缺陷/用例仅补最小只读查询域。 */
export function useTraceRelationCandidates(
  type: string,
  projectId: number,
  page: number,
  title: string,
  verified: boolean,
) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const ready = verified && authenticated && isPositiveSafeId(projectId) && isPositiveSafeId(page);
  const bean = { projectId, ...(title.trim() ? { title: title.trim() } : {}) };
  const params = { page, pageSize: 20, bean };
  const task = useTaskList({
    projectId: ready && type === "TASK" ? projectId : null,
    page,
    pageSize: 20,
    bean,
  });
  const requirement = useRequirementList({
    projectId: ready && type === "REQUIREMENT" ? projectId : null,
    page,
    pageSize: 20,
    bean,
  });
  const defect = useQuery({
    queryKey: queryKeys.defect.list(params),
    queryFn: async () => assertCandidatePage(await defectApi.findByPage(params)),
    enabled: ready && type === "DEFECT",
  });
  const testCase = useQuery({
    queryKey: queryKeys.testCase.list(params),
    queryFn: async () => assertCandidatePage(await testCaseApi.findByPage(params)),
    enabled: ready && type === "TEST_CASE",
  });
  const query =
    type === "TASK"
      ? task
      : type === "REQUIREMENT"
        ? requirement
        : type === "DEFECT"
          ? defect
          : testCase;
  const data = query.data as PageResult<RelationCandidate> | undefined;
  const malformed =
    data && (!Array.isArray(data.list) || !Number.isSafeInteger(data.total) || data.total < 0);
  return {
    ...query,
    data: malformed ? undefined : data,
    isError: query.isError || !!malformed,
    error: malformed ? new Error("响应契约错误：候选分页无效") : query.error,
    candidates: (malformed ? [] : (data?.list ?? [])).filter(
      (row) => row && isPositiveSafeId(row.id) && row.projectId === projectId,
    ),
  };
}
export const isTitleQueryable = (type: AlmObjectType) => type in titleDomains;
