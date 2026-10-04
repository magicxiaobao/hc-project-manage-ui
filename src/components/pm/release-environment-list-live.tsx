/**
 * 发布环境列表（P2：p2-release-env）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：GET /release-environment/v1/project/{projectId}（useReleaseEnvironmentList）
 * - 新建/编辑：ReleaseEnvironmentFormDialog（POST /release-environment/v1/create，
 *   /update），成功后环境域缓存已失效
 * - 停用：ReleaseEnvironmentDisableDialog（POST /release-environment/v1/{id}/disable，
 *   请求体 { reason } 必填）；仅 ACTIVE 行展示停用入口（沿用老前端 canOperate 语义）
 * - 状态：加载 / 错误（重试）/ 空 / 列表
 * - 入口：版本列表页「发布环境」链接；页内提供返回版本列表链接
 *
 * 未登录不使用本组件（路由层渲染登录提示）。
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { EmptyHint, PageHeading } from "@/components/biz";
import { toUserMessage, useReleaseEnvironmentList } from "@/lib/query";
import type { ReleaseEnvironmentResponse } from "@/lib/api/releaseEnvironment-types";
import {
  RELEASE_ENVIRONMENT_CATEGORY_LABELS,
  RELEASE_ENVIRONMENT_STATUS_LABELS,
} from "@/lib/api/releaseEnvironment-types";
import { ReleaseEnvironmentFormDialog } from "@/components/pm/release-environment-form-dialog";
import { ReleaseEnvironmentDisableDialog } from "@/components/pm/release-environment-disable-dialog";

function StatusChip({ status }: { status: ReleaseEnvironmentResponse["status"] }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`type-caption shrink-0 rounded-sm border border-border px-2 py-0.5 ${
        active ? "text-success" : "text-default-400"
      }`}
    >
      {RELEASE_ENVIRONMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function ReleaseEnvironmentListLive({
  projectId,
  projectKey,
}: {
  projectId: number;
  projectKey: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseEnvironmentResponse | null>(null);
  const [disabling, setDisabling] = useState<ReleaseEnvironmentResponse | null>(null);

  const listQuery = useReleaseEnvironmentList({ projectId });
  const environments = listQuery.data ?? [];

  // 编辑弹窗的表单草稿取自打开瞬间的快照（不被后台 refetch 卸载），但 status
  // 必须用列表最新数据：若后台刷新把环境改为 INACTIVE，弹窗提交时仍用旧
  // status 会发送 approvalRequired，违反后端 ReleaseEnvironmentService.update
  //（INACTIVE 更新必须省略 approvalRequired）。按 id 取最新，找不到回退旧对象。
  const editingEnvironment =
    editing == null ? null : (environments.find((candidate) => candidate.id === editing.id) ?? editing);
  const disablingEnvironment =
    disabling == null ? null : (environments.find((candidate) => candidate.id === disabling.id) ?? disabling);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="发布环境"
        hint="真实后端数据（GET /release-environment/v1/project/{projectId}）。环境用于发布的目标场所；生产环境默认要求审批。"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/p/$projectKey/versions"
          params={{ projectKey }}
          className="type-body text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回版本
        </Link>
        <span className="flex-1" />
        <Button variant="secondary" onPress={() => setCreateOpen(true)}>
          新建环境
        </Button>
      </div>

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载发布环境…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">
            发布环境列表加载失败：{toUserMessage(listQuery.error)}
          </p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && environments.length === 0 ? (
        <EmptyHint>该项目还没有发布环境，点击「新建环境」创建第一个。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && environments.length > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {environments.map((environment) => (
            <div
              key={environment.id}
              className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="type-caption shrink-0 text-default-400">#{environment.id}</span>
              <span className="type-body min-w-0 flex-1 truncate">{environment.name}</span>
              <span className="type-caption hidden shrink-0 rounded-sm border border-border px-2 py-0.5 sm:inline">
                {RELEASE_ENVIRONMENT_CATEGORY_LABELS[environment.category] ?? environment.category}
              </span>
              <span className="type-caption hidden shrink-0 text-default-500 md:inline">
                排序 {environment.order}
              </span>
              <span className="type-caption hidden shrink-0 text-default-500 md:inline">
                {environment.approvalRequired ? "需要审批" : "无需审批"}
              </span>
              <span className="shrink-0">
                <StatusChip status={environment.status} />
              </span>
              <span className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onPress={() => setEditing(environment)}>
                  编辑
                </Button>
                {environment.status === "ACTIVE" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onPress={() => setDisabling(environment)}
                  >
                    停用
                  </Button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <ReleaseEnvironmentFormDialog
        open={createOpen}
        projectId={projectId}
        onClose={() => setCreateOpen(false)}
      />
      <ReleaseEnvironmentFormDialog
        open={editing != null}
        projectId={projectId}
        environment={editingEnvironment}
        onClose={() => setEditing(null)}
      />
      <ReleaseEnvironmentDisableDialog
        open={disabling != null}
        environment={disablingEnvironment}
        onClose={() => setDisabling(null)}
      />
    </div>
  );
}
