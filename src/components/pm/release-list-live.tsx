/**
 * 发布列表（P2：p2-release-lifecycle）。
 *
 * 登录态纯展示组件，不再引用 usePm 演示 store：
 * - 数据：POST /release/v1/findByPage 全量拉取（useReleaseListAll 循环分页；
 *   bean 走版本分支 { versionId }，未选版本时走项目分支 { projectId }；
 *   老前端 ReleaseList.vue 版本上下文口径）。后端 ReleasePageRequest 无
 *   status 字段，状态筛选只能在前端做：全量拉取后本地筛选、本地分页，
 *   total/分页按筛选后结果重算（codex r24 P2-4；沿用 P3 useBoardListAll 先例）
 * - 筛选：版本（下拉，全量版本，超 100 也可全选）/ 发布状态（下拉），分页 page/pageSize
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
import { EmptyHint, OptionSelect, PageHeading } from "@/components/biz";
import { toUserMessage, useReleaseListAll, useVersionListAll } from "@/lib/query";
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

  // 版本下拉选项（版本上下文）：全量拉取项目下所有版本。
  // 后端按 ID 升序，单次 page:1/pageSize:100 会在版本超 100 时静默丢弃
  // 第 101 个起的版本（codex r24 P2-10）——这里循环拉取全部（诚实口径）。
  const versionOptionsQuery = useVersionListAll({ projectId });
  const versionOptions = useMemo(
    () =>
      (versionOptionsQuery.data ?? []).map((version) => ({
        id: String(version.id),
        label: `${version.name}（${VERSION_STATUS_LABELS[version.status] ?? version.status}）`,
        status: version.status,
      })),
    [versionOptionsQuery.data],
  );
  const selectedVersion = versionOptions.find((option) => option.id === versionId) ?? null;
  const selectedVersionId = selectedVersion != null ? Number(selectedVersion.id) : null;
  // 所选版本在（全量）下拉中反查失败：不静默回落项目级查询，诚实提示
  //（codex r24 P2-10；全量拉取下只可能发生在版本被他人删除时）
  const versionMissing =
    versionId !== "" && selectedVersion == null && versionOptionsQuery.isSuccess;
  const creatable = isReleaseCreatable(selectedVersion?.status);

  // 发布全量拉取 + 本地状态筛选 + 本地分页（codex r24 P2-4）：
  // 后端无 status 筛选字段，total/分页必须按筛选后结果重算，
  // 否则"筛草稿后本页 0 条却显示共 100 条"是误导。
  const listQuery = useReleaseListAll({
    projectId,
    versionId: selectedVersionId,
  });

  const filtered = useMemo(() => {
    const list = listQuery.data ?? [];
    if (!status) return list;
    return list.filter((release) => release.status === status);
  }, [listQuery.data, status]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 筛选/数据变化后当前页越界时回退到最后一页，避免"第 2 / 1 页"空列表。
  useEffect(() => {
    if (listQuery.isSuccess && !listQuery.isFetching && page > totalPages) {
      setPage(totalPages);
    }
  }, [listQuery.isSuccess, listQuery.isFetching, page, totalPages]);

  const resetFilters = () => {
    setVersionId("");
    setStatus("");
    setPage(1);
  };

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

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
            onChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
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

      {versionMissing ? (
        <p className="type-caption text-danger" role="alert">
          所选版本不在版本列表中（可能已被删除），当前按项目全部发布展示；请重新选择版本。
        </p>
      ) : null}

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

      {listQuery.isSuccess && pageItems.length === 0 ? (
        <EmptyHint>没有符合筛选条件的发布。</EmptyHint>
      ) : null}

      {listQuery.isSuccess && pageItems.length > 0 ? (
        <div className="overflow-hidden rounded-sm border border-border bg-surface">
          {pageItems.map((release) => (
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
