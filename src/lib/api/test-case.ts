import { api } from "./client";
import type { PageRequest, PageResult } from "./types";
import type { TestCaseQueryRequest, TestCaseResponse } from "./test-case-types";

/** 仅供关联对象分页选择及按 ID 补标题。 */
export const testCaseApi = {
  findByPage: (params: PageRequest<TestCaseQueryRequest>) =>
    api.post<PageResult<TestCaseResponse>>("/testCase/v1/findByPage", params),
  findById: (id: number) => api.get<TestCaseResponse>("/testCase/v1/findById/" + id),
};
