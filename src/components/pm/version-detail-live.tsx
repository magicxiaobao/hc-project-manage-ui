/**
 * 版本详情（P2：p2-version-slices）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 详情：GET /version/v1/findById/{id}
 * - 状态流转：按 versionTransitionEvents(detail.status) 渲染事件按钮
 *   （忠实于后端 VersionEvent 拓扑；目标状态由服务端按事件解析，前端不硬编码），
 *   执行 POST /version/v1/{id}/transition（{ event, expectedStatus, reason? }；
 *   expectedStatus = 详情读到的当前状态，乐观并发，绝不臆造）
 * - 编辑：VersionFormDialog（POST /version/v1/updateVersion 字段级更新；
 *   空文本按后端 null-skip 语义转为 null = 保留原值，不清空；状态不在此入口）
 * - DEPRECATED 版本：后端拒绝一切更新/流转，操作区隐藏并提示
 *
 * 后端日期说明：plannedStartDate/plannedEndDate/plannedReleaseDate/
 * actualStartDate/actualEndDate 为 LocalDateTime（'YYYY-MM-DDTHH:mm:ss' 字符串，
 * 不做时区换算）；createdAt/updatedAt 为秒级时间戳。
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import {
  EmptyHint,
  PageHeading,
  VersionStatusChip,
} from "@/components/biz";
import { VersionFormDialog } from "@/components/pm/version-form-dialog";
import { VersionTransitionDialog } from "@/components/pm/version-transition-dialog";
import {
  toUserMessage,
  useProjectIdByKey,
  useVersionDetail,
  versionTransitionEvents,
} from "@/lib/query";
import type { VersionEvent } from "@/lib/api/version-types";
import { VERSION_EVENT_LABELS } from "@/lib/api/version-types";

/** 后端 createdAt/updatedAt 为秒级时间戳，转本地时间展示 */
function formatEpochSecond(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Date(value * 1000).toLocaleString("zh-CN", { hour12: false });
}

/** 后端 LocalDateTime 'YYYY-MM-DDTHH:mm:ss'，直接展示不做时区换算 */
function formatLocalDateTime(value: string | null | undefined): string {
  if (value == null || value === "") return "-";
  return value.replace("T", " ");
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-default-500">{label}</dt>
      <dd className="type-body mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (value == null || value === "") {
    return <p className="type-caption text-default-500">暂无{label}。</p>;
  }
  return (
    <div>
      <h3 className="type-emphasis mb-1">{label}</h3>
      <p className="type-body whitespace-pre-wrap rounded-sm border border-border bg-surface p-4">
        {value}
      </p>
    </div>
  );
}

export function VersionDetailLive({
  versionId,
  projectKey,
}: {
  versionId: number;
  projectKey: string;
}) {
  const detailQuery = useVersionDetail(versionId);
  const detail = detailQuery.data ?? null;
  // 沿用 DefectDetailLive 的同类守卫：路由里的 projectKey 必须解析出项目并与
  // 记录的 projectId 一致，否则跨项目链接会在错误的项目上下文里展示并允许
  // 操作其它项目的版本。解析中/解析失败时不误判。
  const routeProjectQuery = useProjectIdByKey(projectKey);

  // 状态流转弹窗（共享 VersionTransitionDialog，预设事件 = 按钮选择的事件）
  const [transitionEvent, setTransitionEvent] = useState<VersionEvent | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // 弹窗实例在早返回之外声明：pending/error/not-found/成功四个分支共用同一
  // keyed 实例；后台重取失败（isError 但保留缓存 data）时错误分支只在顶部加
  // 横幅、不卸载子树，编辑/流转弹窗的脏草稿得以保留
  //（仿 testsuite-detail-live 约定；r19 P2 真问题）。
  // detail 为 null 时弹窗没有可打开的入口（按钮依赖详情数据），渲染 null。
  const routeProjectId = routeProjectQuery.data;
  // 写操作区（状态流转/编辑）只有在路由项目解析成功且与记录的 projectId
  // 精确一致时才渲染。解析中/解析失败（无可用数据）时只读展示。
  const projectContextVerified =
    typeof routeProjectId === "number" &&
    detail != null &&
    detail.projectId != null &&
    detail.projectId === routeProjectId;
  const transitionDialog = detail ? (
    <VersionTransitionDialog
      key={`transition-${versionId}`}
      versionId={versionId}
      fromStatus={detail.status}
      event={transitionEvent}
      open={transitionEvent != null}
      projectContextVerified={projectContextVerified}
      onClose={() => setTransitionEvent(null)}
    />
  ) : null;
  const editDialog = detail ? (
    <VersionFormDialog
      key={`edit-${detail.id}`}
      open={editOpen}
      projectId={detail.projectId ?? 0}
      version={detail}
      // 提交前复核归属：弹窗打开后路由项目翻转时拒绝提交（沿用
      // TestSuiteFormDialog 的 submitVeto 先例；codex r20 P2-1），
      // 拒绝后草稿保留、弹窗不卸载，关闭仍走 dirty check
      submitVeto={() =>
        projectContextVerified ? null : "项目归属已变化，无法提交。请刷新页面后重试。"
      }
      // 编辑成功后 useUpdateVersion 的 onSuccess 已 toast 并失效版本域缓存，
      // 详情自动重取；取消关闭无需额外提示
      onClose={() => setEditOpen(false)}
    />
  ) : null;

  if (detailQuery.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-default-500">
        <Spinner size="sm" />
        正在加载版本详情…
        {transitionDialog}
        {editDialog}
      </div>
    );
  }

  // 项目归属检查优先于"后台重取失败"分支（codex r20 P2-3）：错项目链接下
  // 后台重取失败时也只展示"不属于当前项目"，不展示其它项目的缓存详情
  // （文件头契约：跨项目链接不得在错误的项目上下文展示并允许操作）。
  // 分支根统一用 Fragment（codex r20 P2-2）：成功/缓存错误分支的对话框实例
  // 在同一 Fragment 父节点下，归属翻转时不再因根容器类型不同而 remount。
  if (
    typeof routeProjectId === "number" &&
    detail != null &&
    detail.projectId != null &&
    detail.projectId !== routeProjectId
  ) {
    return (
      <>
        <div className="px-4 py-8">
          <EmptyHint>{`版本 #${versionId} 不属于当前项目（/p/${projectKey}），请检查链接。`}</EmptyHint>
        </div>
        {transitionDialog}
        {editDialog}
      </>
    );
  }

  const projectContextNotice = routeProjectQuery.isPending
    ? "正在确认项目归属，操作区稍后可用…"
    : "当前无法确认该记录归属于此项目，操作区已禁用。";

  const deprecated = detail?.status === "DEPRECATED";
  const events = !detail || deprecated ? [] : versionTransitionEvents(detail.status);

  // 有缓存数据时的详情主内容：成功分支与"后台刷新失败"分支共用，不卸载子树
  const detailContent = detail ? (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          to="/p/$projectKey/versions"
          params={{ projectKey }}
          className="type-caption text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回版本列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PageHeading
            title={detail.name}
            hint={`版本 #${detail.id} · 真实后端数据（GET /version/v1/findById）。`}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="type-caption rounded-sm border border-border px-2 py-0.5">
            {detail.versionNumber}
          </span>
          <span className="type-caption text-default-500">{detail.versionType}</span>
          <VersionStatusChip status={detail.status} />
        </div>
      </div>

      <section aria-label="基本信息">
        <h2 className="type-emphasis mb-2">基本信息</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-sm border border-border bg-surface p-4 sm:grid-cols-4">
          <MetaItem label="版本号" value={detail.versionNumber} />
          <MetaItem label="版本类型" value={detail.versionType} />
          <MetaItem label="负责人 ID" value={detail.assigneeId != null ? String(detail.assigneeId) : "-"} />
          <MetaItem label="计划开始日期" value={formatLocalDateTime(detail.plannedStartDate)} />
          <MetaItem label="计划结束日期" value={formatLocalDateTime(detail.plannedEndDate)} />
          <MetaItem label="实际开始日期" value={formatLocalDateTime(detail.actualStartDate)} />
          <MetaItem label="实际结束日期" value={formatLocalDateTime(detail.actualEndDate)} />
          <MetaItem label="计划发布日期" value={formatLocalDateTime(detail.plannedReleaseDate)} />
          <MetaItem label="标签" value={detail.tags ?? "-"} />
          <MetaItem label="所属项目 ID" value={detail.projectId != null ? String(detail.projectId) : "-"} />
          <MetaItem label="创建时间" value={formatEpochSecond(detail.createdAt)} />
          <MetaItem label="更新时间" value={formatEpochSecond(detail.updatedAt)} />
        </dl>
      </section>

      <section aria-label="版本描述" className="flex flex-col gap-4">
        <TextBlock label="描述" value={detail.description} />
      </section>

      {deprecated ? (
        <p className="type-body rounded-sm border border-border bg-surface px-3 py-2 text-default-500">
          该版本已废弃（DEPRECATED），后端拒绝一切更新与状态流转，操作区已禁用。
        </p>
      ) : projectContextVerified ? (
        <>
          <section aria-label="状态流转">
            <h2 className="type-emphasis mb-2">状态流转</h2>
            {events.length === 0 ? (
              <p className="type-caption text-default-500">
                当前状态无可用流转事件。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {events.map((event) => (
                  <Button
                    key={event}
                    size="sm"
                    variant="primary"
                    onPress={() => setTransitionEvent(event)}
                  >
                    {VERSION_EVENT_LABELS[event]}
                  </Button>
                ))}
              </div>
            )}
          </section>

          <section aria-label="编辑">
            <h2 className="type-emphasis mb-2">编辑</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onPress={() => setEditOpen(true)}>
                编辑版本
              </Button>
            </div>
          </section>
        </>
      ) : (
        <p className="type-body rounded-sm border border-border bg-surface px-3 py-2 text-default-500">
          {projectContextNotice}
        </p>
      )}

    </div>
  ) : null;

  if (detailQuery.isError) {
    if (detail) {
      // 后台重取失败但有缓存数据：顶部横幅提示，不卸载子树（弹窗草稿保留）
      return (
        <>
          <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-4 md:px-6 md:pt-6">
            <div
              role="alert"
              className="rounded-sm border border-danger/40 bg-danger/5 px-4 py-3"
            >
              <p className="type-body text-danger">
                版本详情刷新失败：{toUserMessage(detailQuery.error)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onPress={() => void detailQuery.refetch()}
              >
                重试
              </Button>
            </div>
          </div>
          {detailContent}
          {transitionDialog}
          {editDialog}
        </>
      );
    }
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-8">
        <p className="type-body text-danger">版本详情加载失败：{toUserMessage(detailQuery.error)}</p>
        <Button variant="ghost" onPress={() => void detailQuery.refetch()}>
          重试
        </Button>
        {transitionDialog}
        {editDialog}
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="px-4 py-8">
        <EmptyHint>{`没有找到这个版本（id=${versionId}）。`}</EmptyHint>
        {transitionDialog}
        {editDialog}
      </div>
    );
  }

  return (
    <>
      {detailContent}
      {transitionDialog}
      {editDialog}
    </>
  );
}
