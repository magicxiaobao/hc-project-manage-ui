/** URL 与查询输入共享规则：只 trim，不改变内部文本或 LIKE 通配符。 */
export function normalizeSearchKeyword(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function searchKeywordError(value: unknown): string | undefined {
  const keyword = normalizeSearchKeyword(value);
  if (Array.from(keyword).length > 200) return "关键词不能超过 200 字符。";
  if (
    Array.from(keyword).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || (code >= 127 && code <= 159);
    })
  )
    return "关键词不能包含控制字符。";
  return undefined;
}

export const SEARCH_DOMAINS = ["task", "defect", "requirement", "testCase"] as const;
export type SearchDomain = (typeof SEARCH_DOMAINS)[number];
export const SEARCH_LABELS: Record<SearchDomain, string> = {
  task: "任务",
  defect: "缺陷",
  requirement: "需求",
  testCase: "测试用例",
};
export type GlobalSearchParams = { keyword?: string; projectKey?: string; tab?: SearchDomain };
export function parseGlobalSearch(value: Record<string, unknown>): GlobalSearchParams {
  return {
    keyword: normalizeSearchKeyword(value.keyword) || undefined,
    projectKey:
      value.projectKey === undefined
        ? undefined
        : typeof value.projectKey === "string"
          ? value.projectKey
          : "",
    tab: SEARCH_DOMAINS.includes(value.tab as SearchDomain) ? (value.tab as SearchDomain) : "task",
  };
}
