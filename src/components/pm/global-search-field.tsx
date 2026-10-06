import { Button } from "@heroui/react";
import { QueryField } from "@/components/biz/query-field";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/lib/api/auth-store";
import {
  normalizeSearchKeyword,
  parseGlobalSearch,
  searchKeywordError,
} from "@/lib/search/keyword";
import { useGlobalSearchDraft } from "./global-search-draft";

export function focusGlobalSearch() {
  document.getElementById("global-search-input")?.focus();
}
export function GlobalSearchField() {
  const location = useRouterState({ select: (state) => state.location });
  const router = useRouter();
  const navigate = useNavigate();
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.userId);
  const account = `${authenticated}:${userId}`;
  const onSearchPage = location.pathname.replace(/\/+$/, "") === "/search";
  const committed = useMemo(
    () => (onSearchPage ? parseGlobalSearch(location.search) : {}),
    [onSearchPage, location.search],
  );
  const stamp = `${location.href}:${account}`;
  const [draft, setDraft] = useState({ stamp, value: committed.keyword ?? "", edited: false });
  // URL/history 与账号变化在当前渲染同步，旧 effect 不会带着旧输入再提交。
  if (draft.stamp !== stamp) setDraft({ stamp, value: committed.keyword ?? "", edited: false });
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { setWaiting } = useGlobalSearchDraft();
  const value = draft.stamp === stamp ? draft.value : (committed.keyword ?? "");
  const error = searchKeywordError(value);
  const cancelTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const submit = useCallback(
    (next: string, allowEmpty = false) => {
      cancelTimer();
      if (!authenticated || composingRef.current || searchKeywordError(next)) return;
      const keyword = normalizeSearchKeyword(next);
      if (!keyword && !onSearchPage && !allowEmpty) return;
      if (onSearchPage && keyword === (committed.keyword ?? "")) {
        setWaiting(false);
        return;
      }
      setDraft({ stamp, value: next, edited: false });
      void navigate({
        to: "/search",
        search: { ...(onSearchPage ? committed : {}), keyword: keyword || undefined },
        replace: onSearchPage,
      });
    },
    [cancelTimer, authenticated, onSearchPage, committed, setWaiting, stamp, navigate],
  );
  const change = (next: string) => {
    cancelTimer();
    setDraft({ stamp, value: next, edited: true });
    setWaiting(onSearchPage && normalizeSearchKeyword(next) !== (committed.keyword ?? ""));
    if (!next) submit("");
  };
  useEffect(() => {
    setWaiting(onSearchPage && normalizeSearchKeyword(value) !== (committed.keyword ?? ""));
    if (
      draft.stamp !== stamp ||
      !draft.edited ||
      composing ||
      error ||
      !authenticated ||
      !normalizeSearchKeyword(value)
    )
      return;
    timer.current = setTimeout(() => {
      const auth = useAuthStore.getState();
      if (
        router.state.location.href !== location.href ||
        `${auth.isAuthenticated}:${auth.user?.userId}` !== account
      )
        return;
      submit(value);
    }, 300);
    return cancelTimer;
  }, [
    draft,
    stamp,
    composing,
    error,
    authenticated,
    onSearchPage,
    value,
    committed.keyword,
    setWaiting,
    router,
    location.href,
    account,
    submit,
    cancelTimer,
  ]);
  useEffect(() => {
    composingRef.current = false;
    setComposing(false);
    return cancelTimer;
  }, [stamp, cancelTimer]);
  return (
    <div className="ml-auto flex w-full min-w-0 max-w-md items-start gap-2">
      <div className="min-w-0 flex-1">
        <QueryField
          label="全局搜索"
          value={value}
          onChange={change}
          error={error}
          isDisabled={!authenticated}
          placeholder={authenticated ? "搜索任务、缺陷、需求、测试用例" : "登录后使用全局搜索"}
          inputProps={{
            id: "global-search-input",
            onCompositionStart: () => {
              composingRef.current = true;
              setComposing(true);
              cancelTimer();
            },
            onCompositionEnd: (event) => {
              composingRef.current = false;
              setComposing(false);
              change(event.currentTarget.value);
            },
            onKeyDown: (event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.stopPropagation();
              if (!composingRef.current && !event.nativeEvent.isComposing) submit(value, true);
            },
          }}
        />
      </div>
      <Button
        size="sm"
        variant="ghost"
        aria-label="提交全局搜索"
        isDisabled={!authenticated || !!error || composing}
        onPress={() => submit(value, true)}
      >
        搜索
      </Button>
    </div>
  );
}
