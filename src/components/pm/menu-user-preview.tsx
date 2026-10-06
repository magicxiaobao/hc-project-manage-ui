import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { FieldError } from "@/components/biz";
import { isMenuId } from "@/lib/menu-tree";
import { toUserMessage, useMenuTreeByUser } from "@/lib/query";
import { MenuTree } from "./menu-tree";

export function MenuUserPreview() {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [error, setError] = useState("");
  const result = useMenuTreeByUser(submitted);
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-default-200 p-4"
      aria-label="用户菜单校验"
    >
      <h2 className="font-semibold">用户菜单校验</h2>
      <p className="text-sm text-default-500">当前返回结果尚未按用户权限过滤</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = draft.trim();
          if (!/^[1-9]\d*$/.test(value)) {
            setError("请输入正的安全整数用户 ID");
            return;
          }
          const id = Number(value);
          if (!isMenuId(id)) {
            setError("请输入正的安全整数用户 ID");
            return;
          }
          setError("");
          if (submitted === id) void result.refetch();
          else setSubmitted(id);
        }}
      >
        <div>
          <TextField
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setError("");
            }}
            aria-label="用户 ID"
          >
            <Label>用户 ID</Label>
            <Input />
          </TextField>
          <FieldError message={error} />
        </div>
        <Button type="submit" variant="primary">
          查询
        </Button>
        <Button
          variant="ghost"
          isDisabled={submitted === null || result.isFetching}
          onPress={() => {
            void result.refetch();
          }}
        >
          刷新用户菜单
        </Button>
      </form>
      {submitted !== null ? (
        <p className="type-meta">
          已查询用户 #{submitted}
          {result.isFetching ? " · 正在加载…" : ""}
        </p>
      ) : null}
      {result.isError ? (
        <p role="alert" className="text-danger">
          {result.data ? "刷新失败，展示上次结果" : "用户菜单查询失败"}：
          {toUserMessage(result.error)}
        </p>
      ) : null}
      {result.data ? (
        <MenuTree
          nodes={result.data.map((row) => ({ ...row, children: [] }))}
          expanded={new Set()}
          onToggle={() => {}}
          label="用户菜单结果"
        />
      ) : null}
    </section>
  );
}
