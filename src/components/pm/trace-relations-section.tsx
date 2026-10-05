import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { useAuthStore } from "@/lib/api/auth-store";
import type { AlmObjectKey, AlmRelation } from "@/lib/api/trace-types";
import { toUserMessage, useTraceRelations, useTraceObjectTitle } from "@/lib/query";
import { isTitleQueryable } from "@/lib/query/hooks/useTraceRelations";
import {
  canUnlinkRelation,
  isObjectKey,
  isPositiveSafeId,
  objectLabel,
  sameObject,
  relationsForObject,
  RELATION_LABELS,
} from "@/lib/trace-relations";
import { TraceRelationFormDialog } from "./trace-relation-form-dialog";
import { TraceRelationUnlinkDialog } from "./trace-relation-unlink-dialog";

export interface TraceRelationsContext {
  object: AlmObjectKey;
  title: string | null;
  projectId: number;
  projectKey: string;
}
export interface FrozenRelation {
  relation: AlmRelation;
  summary: string;
}
function ObjectReference({
  object,
  title,
  projectKey,
}: {
  object: AlmObjectKey;
  title?: string | null;
  projectKey: string;
}) {
  const label = objectLabel(object, title);
  if (object.objectType === "TASK")
    return (
      <Link
        to="/p/$projectKey/issues/$taskId"
        params={{ projectKey, taskId: String(object.objectId) }}
        className="text-accent hover:underline"
      >
        {label}
      </Link>
    );
  if (object.objectType === "REQUIREMENT")
    return (
      <Link
        to="/p/$projectKey/requirements/$requirementId"
        params={{ projectKey, requirementId: String(object.objectId) }}
        className="text-accent hover:underline"
      >
        {label}
      </Link>
    );
  return <span>{label}</span>;
}
function RelationRow({
  relation,
  context,
  direction,
  onUnlink,
  disabled,
}: {
  relation: AlmRelation;
  context: TraceRelationsContext;
  direction: "outgoing" | "incoming";
  onUnlink: (snapshot: FrozenRelation) => void;
  disabled: boolean;
}) {
  const sourceIsCurrent = sameObject(relation.sourceObject, context.object);
  const targetIsCurrent = sameObject(relation.targetObject, context.object);
  const sourceQuery = useTraceObjectTitle(
    relation.sourceObject,
    context.projectId,
    !sourceIsCurrent,
  );
  const targetQuery = useTraceObjectTitle(
    relation.targetObject,
    context.projectId,
    !targetIsCurrent,
  );
  const sourceTitle = sourceIsCurrent
    ? context.title
    : sourceQuery.data?.projectId === context.projectId &&
        sourceQuery.data.id === relation.sourceObject.objectId
      ? sourceQuery.data.title
      : null;
  const targetTitle = targetIsCurrent
    ? context.title
    : targetQuery.data?.projectId === context.projectId &&
        targetQuery.data.id === relation.targetObject.objectId
      ? targetQuery.data.title
      : null;
  const summary = `${objectLabel(relation.sourceObject, sourceTitle)} → ${objectLabel(relation.targetObject, targetTitle)} · ${RELATION_LABELS[relation.relationType]}`;
  return (
    <li className="space-y-1 rounded border border-border p-2 text-sm">
      <p className="break-words">
        <ObjectReference
          object={relation.sourceObject}
          title={sourceTitle}
          projectKey={context.projectKey}
        />{" "}
        →{" "}
        <ObjectReference
          object={relation.targetObject}
          title={targetTitle}
          projectKey={context.projectKey}
        />
      </p>
      <p>
        {RELATION_LABELS[relation.relationType]}{" "}
        <span className="break-all text-default-500">{relation.relationType}</span>
      </p>
      <p className="type-caption text-default-500">
        {direction === "outgoing" ? "出向" : "入向"} · 来源：
        {relation.relationSource === "MANUAL" ? "人工" : "业务操作"}（{relation.relationSource}）
      </p>
      {[
        { object: relation.sourceObject, current: sourceIsCurrent, query: sourceQuery },
        { object: relation.targetObject, current: targetIsCurrent, query: targetQuery },
      ].map(({ object, current, query }) => {
        if (current || !isTitleQueryable(object.objectType)) return null;
        const mismatch =
          query.data &&
          (query.data.id !== object.objectId || query.data.projectId !== context.projectId);
        if (query.isError || mismatch)
          return (
            <p key={object.objectType + object.objectId} role="alert" className="text-danger">
              {objectLabel(object)} 标题加载失败，保留编号。
              {query.isError ? toUserMessage(query.error) : "项目归属不匹配"}
              <Button size="sm" variant="ghost" onPress={() => void query.refetch()}>
                重试标题
              </Button>
            </p>
          );
        return query.isPending ? (
          <p key={object.objectType + object.objectId} className="type-caption">
            {objectLabel(object)} 标题加载中…
          </p>
        ) : null;
      })}
      {canUnlinkRelation(relation) ? (
        <Button
          size="sm"
          variant="danger-soft"
          isDisabled={disabled}
          onPress={() =>
            onUnlink({
              relation: Object.freeze({
                ...relation,
                sourceObject: Object.freeze({ ...relation.sourceObject }),
                targetObject: Object.freeze({ ...relation.targetObject }),
              }),
              summary,
            })
          }
        >
          解除
        </Button>
      ) : (
        <p className="type-caption text-default-500">只读关系</p>
      )}
    </li>
  );
}
export function TraceRelationsSection(props: TraceRelationsContext) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const verified = authenticated && isPositiveSafeId(props.projectId) && isObjectKey(props.object);
  const query = useTraceRelations({
    projectId: props.projectId,
    objects: [props.object],
    contextVerified: verified,
  });
  const [session, setSession] = useState(0);
  const [creating, setCreating] = useState(false);
  const [unlink, setUnlink] = useState<FrozenRelation | null>(null);
  const groups = verified && query.data ? relationsForObject(query.data, props.object) : null;
  const contextKey = `${props.projectId}:${props.object.objectType}:${props.object.objectId}:${session}`;
  return (
    <section aria-label="关联对象" className="min-w-0 rounded border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="type-emphasis">关联对象</h2>
        {verified ? (
          <Button
            size="sm"
            variant="secondary"
            isDisabled={creating || !!unlink}
            onPress={() => {
              setSession((n) => n + 1);
              setCreating(true);
            }}
          >
            新建关联
          </Button>
        ) : null}
      </div>
      {!verified ? (
        <p>尚未确认项目归属，关联操作已禁用。</p>
      ) : (
        <>
          {query.isPending ? (
            <p>
              <Spinner size="sm" /> 正在加载关联…
            </p>
          ) : null}
          {query.isFetching && query.data ? <p className="type-caption">正在刷新关联…</p> : null}
          {query.isError ? (
            <p role="alert" className="text-danger">
              关联加载失败：{toUserMessage(query.error)}
              {query.data ? "（上次数据可能已过期）" : ""}
              <Button size="sm" variant="ghost" onPress={() => void query.refetch()}>
                重试关联
              </Button>
            </p>
          ) : null}
          {groups
            ? (["outgoing", "incoming"] as const).map((direction) => (
                <section
                  key={direction}
                  className="mt-3"
                  aria-label={direction === "outgoing" ? "关联到其他对象" : "其他对象关联到此对象"}
                >
                  <h3 className="mb-2 font-medium">
                    {direction === "outgoing"
                      ? "关联到其他对象（outgoing）"
                      : "其他对象关联到此对象（incoming）"}
                  </h3>
                  {!groups[direction].length ? (
                    <p className="type-caption">{query.isError ? "上次读取无关联" : "暂无关联"}</p>
                  ) : (
                    <ul className="space-y-2">
                      {groups[direction].map((relation) => (
                        <RelationRow
                          key={relation.id}
                          relation={relation}
                          context={props}
                          direction={direction}
                          disabled={creating || !!unlink || query.isError || query.isFetching}
                          onUnlink={(snapshot) => {
                            setSession((n) => n + 1);
                            setUnlink(snapshot);
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ))
            : null}
        </>
      )}
      {verified && creating ? (
        <TraceRelationFormDialog
          key={contextKey}
          context={props}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {verified && unlink ? (
        <TraceRelationUnlinkDialog
          key={contextKey}
          context={props}
          snapshot={unlink}
          onClose={() => setUnlink(null)}
        />
      ) : null}
    </section>
  );
}
