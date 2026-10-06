import type { ProjectViewSearch } from "@/lib/pm/navigation";
import { useState, type SetStateAction } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  normalizeSearchKeyword,
  searchKeywordError,
  type SearchDomain,
} from "@/lib/search/keyword";
const listRoutes = {
  task: "/p/$projectKey/issues",
  defect: "/p/$projectKey/defects",
  requirement: "/p/$projectKey/requirements",
  testCase: "/p/$projectKey/testcases",
} as const;

/** URL 是已应用标题的唯一来源；在渲染阶段重置页码，避免先请求旧页/无标题。 */
export function useListTitleSearch(
  domain: SearchDomain,
  projectId: number,
  projectKey: string,
  keyword: string | undefined,
) {
  const navigate = useNavigate();
  const appliedTitle = normalizeSearchKeyword(keyword);
  const stamp = `${projectId}:${projectKey}:${appliedTitle}`;
  const [state, setState] = useState({
    stamp,
    title: appliedTitle,
    page: 1,
    error: searchKeywordError(keyword),
  });
  if (state.stamp !== stamp)
    setState({ stamp, title: appliedTitle, page: 1, error: searchKeywordError(keyword) });
  const current =
    state.stamp === stamp
      ? state
      : { stamp, title: appliedTitle, page: 1, error: searchKeywordError(keyword) };
  const setTitleInput = (title: string) =>
    setState((previous) => ({ ...previous, title, error: undefined }));
  const setPage = (value: SetStateAction<number>) =>
    setState((previous) => ({
      ...previous,
      page: typeof value === "function" ? value(previous.page) : value,
    }));
  const updateUrl = (title: string) => {
    void navigate({
      to: listRoutes[domain],
      params: { projectKey },
      search: (previous: ProjectViewSearch) => ({
        ...previous,
        keyword: normalizeSearchKeyword(title) || undefined,
      }),
    });
  };
  const applyTitle = () => {
    const error = searchKeywordError(current.title);
    if (error) {
      setState((previous) => ({ ...previous, error }));
      return false;
    }
    setPage(1);
    updateUrl(current.title);
    return true;
  };
  const resetTitle = () => {
    setState({ stamp, title: "", page: 1, error: undefined });
    updateUrl("");
  };
  return {
    titleInput: current.title,
    setTitleInput,
    appliedTitle,
    page: current.page,
    setPage,
    titleError: current.error,
    applyTitle,
    resetTitle,
    queryProjectId: searchKeywordError(keyword) ? null : projectId,
  };
}
