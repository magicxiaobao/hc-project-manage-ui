/** 关联候选所需的只读投影，字段来自 TestCaseQueryRequest/TestCaseResponse。 */
export interface TestCaseQueryRequest {
  projectId: number;
  title?: string;
}
export interface TestCaseResponse {
  id: number | null;
  title: string | null;
  projectId: number | null;
}
