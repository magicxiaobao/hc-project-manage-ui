/**
 * 发布列表（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /release/v1/findByPage（bean 走版本分支 { versionId }；
 *   未选版本时走项目分支 { projectId }；老前端 ReleaseList.vue 版本上下文口径）
 * - 筛选：版本（下拉）/ 发布状态（下拉），分页 page/pageSize
 * - 新建草稿：ReleaseDraftCreateDialog（POST /release/v1/create；仅当所选版本
 *   状态为 FROZEN/RELEASED 时可创建，老前端 ReleaseDraft.vue
 *   releaseCreatable 口径）；成功后跳转发布详情
 * - 行名称深链到 /p/$projectKey/releases/$releaseId（发布详情）
 * - 状态：加载 / 错误（重试）/ 空 / 列表 + 分页
 *
 * 未登录走演示发布管理（ReleasesView）时不使用本组件。
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, Spinner } from "@heroui/react";
import { shouldClampPage } from "@/lib/pagination";
import { EmptyHint, OptionSelect, PageHeading } from "@/components/biz";
import { toUserMessage, useReleaseList, useVersionList } from "@/lib/query";
import { RELEASE_STATUSES, RELEASE_STATUS_LABELS, RELEASE_TYPE_LABELS } from "@/lib/api/release-types";
import type { ReleaseResponse } from "@/lib/api/release-types";
import { VERSION_STATUS_LABELS } from "@/lib/api/version-types";
import { ReleaseDraftCreateDialog } from "@/components/pm/release-form-dialog";

const PAGE_SIZE = 20;

/** 只有 FROZEN/RELEASED 版本可以创建发布草稿（老前端 releaseCreatable） */
function isReleaseCreatable(status: string | undefined): boolean {
  return status === "FROZEN" || status === "RELEASED";
}

function StatusChip({ status }: { status: ReleaseResponse["status"] }) {
  const terminal = status === "RELEASED";
  const failed = status === "FAILED" || status === "REJECTED" || status === "CANCELLED";
  return (
    <span
      className={`type-caption shrink-0 rounded-sm border border-border px-2 py-0.5 ${
        terminal ? "text-success" : failed ? "text-danger" : "text-default-500"
      }`}
    >
      {RELEASE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function ReleaseListLive({ projectId, projectKey }: { projectId: number; projectKey: string }) {
  const navigate = useNavigate();
  const [versionId, setVersionId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  // 版本下拉选项（版本上下文）：取项目下最多 100 个版本
  const versionOptionsQuery = useVersionList({ page: 1, pageSize: 100, projectId });
  const versionOptions = useMemo(
    () =>
      (versionOptionsQuery.data?.list ?? []).map((version) => ({
        id: String(version.id),
        label: `${version.name}（${VERSION_STATUS_LABELS[version.status] ?? version.status}）`,
        status: version.status,
      })),
    [versionOptionsQuery.data],
  );
  const selectedVersion = versionOptions.find((option) => option.id === versionId) ?? null;
  const selectedVersionId = selectedVersion != null ? Number(selectedVersion.id) : null;
  const creatable = isReleaseCreatable(selectedVersion?.status);

  const listQuery = useReleaseList({
    page,
    pageSize: PAGE_SIZE,
    projectId,
    versionId: selectedVersionId,
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 数据返回后若当前页已越界（他人增删导致 total 缩水），自动回退到最后一页重新查询，
  // 避免出现"第 2 / 1 页"且空列表的误导状态（沿用 version-list-live 的钳制语义）。
  useEffect(() => {
    const clamped = shouldClampPage(listQuery.isSuccess, listQuery.isFetching, page, total, PAGE_SIZE);
    if (clamped !== null) setPage(clamped);
  }, [listQuery.isSuccess, listQuery.isFetching, page, total]);

  const resetFilters = () => {
    setVersionId("");
    setStatus("");
    setPage(1);
  };

  const releases = useMemo(() => {
    const list = listQuery.data?.list ?? [];
    if (!status) return list;
    return list.filter((release) => release.status === status);
  }, [listQuery.data, status]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="发布列表"
        hint="真实后端数据（POST /release/v1/findByPage）。发布按版本组织：先选版本再查看该版本的发布，或直接查看项目全部发布。"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/p/$projectKey/versions"
          params={{ projectKey }}
          className="type-body text-default-500 underline-offset-2 hover:underline"
        >
          ← 返回版本
        </Link>
        <div className="w-64">
          <OptionSelect
            label="版本"
            value={versionId}
            options={[{ id: "", label: "全部版本" }, ...versionOptions]}
            onChange={(next) => {
              setVersionId(next);
              setPage(1);
            }}
          />
        </div>
        <div className="w-36">
          <OptionSelect
            label="状态"
            value={status}
            options={[
              { id: "", label: "全部" },
              ...RELEASE_STATUSES.map((releaseStatus) => ({
                id: releaseStatus,
                label: RELEASE_STATUS_LABELS[releaseStatus],
              })),
            ]}
            onChange={(next) => setStatus(next)}
          />
        </div>
        <Button variant="ghost" onPress={resetFilters}>
          重置
        </Button>
        <span className="flex-1" />
        <Button
          variant="primary"
          onPress={() => setCreateOpen(true)}
          isDisabled={!creatable || selectedVersionId == null}
        >
          新建发布草稿
        </Button>
      </div>

      {selectedVersionId != null && !creatable ? (
        <p className="type-caption text-default-500">
          当前所选版本状态为{VERSION_STATUS_LABELS[selectedVersion!.status] ?? selectedVersion!.status}，
          仅冻结（FROZEN）/已发布（RELEASED）版本可创建发布草稿（老前端 ReleaseDraft.vue releaseCreatable 口径）。
        </p>
      ) : null}

      {listQuery.isPending ? (
        <div className="flex items-center gap-2 py-8 text-sm text-default-500">
          <Spinner size="sm" />
          正在加载发布…
        </div>
      ) : null}

      {listQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="type-body text-danger">发布列表加载失败：{toUserMessage(listQuery.error)}</p>
          <Button variant="ghost" onPress={() => void listQuery.refetch()}>
            重试
          </Button>
        </div>
      ) : null}

      {listQuery.isSuccess && releases.length === 0 ? (
        <EmptyHint>没有符合筛选条件的发布。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && releases.length > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {releases.map((release) => (
            <div key={release.id} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <span className="type-caption shrink-0 text-default-400">#{release.id}</span>
              <Link
                to="/p/$projectKey/releases/$releaseId"
                params={{ projectKey, releaseId: String(release.id) }}
                className="type-body min-w-0 flex-1 truncate underline-offset-2 hover:underline"
              >
                {release.releaseNotes?.trim() || `发布 #${release.id}`}
              </Link>
              <span className="type-caption hidden shrink-0 text-default-500 sm:inline">
                {RELEASE_TYPE_LABELS[release.releaseType] ?? release.releaseType}
              </span>
              <span className="type-caption hidden shrink-0 text-default-400 md:inline">
                序号 {release.sequenceNo}
              </span>
              <span className="shrink-0">
                <StatusChip status={release.status} />
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {listQuery.isSuccess ? (
        <div className="flex items-center justify-between gap-3">
          <span className="type-meta">
            共 {total} 条 · 第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              isDisabled={page <= 1}
              onPress={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isDisabled={page >= totalPages}
              onPress={() => setPage((current) => current + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}

      {selectedVersionId != null ? (
        <ReleaseDraftCreateDialog
          open={createOpen}
          projectId={projectId}
          versionId={selectedVersionId}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            void navigate({
              to: "/p/$projectKey/releases/$releaseId",
              params: { projectKey, releaseId: String(created.id) },
            });
          }}
        />
      ) : null}
    </div>
  );
}
