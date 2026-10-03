/**
 * 项目详情展示（P1：p1-project-detail-live）。
 *
 * 纯展示组件：数据来自 GET /project/v1/findById/{id}（ProjectResponse），
 * 不再引用 usePm 演示 store。未登录走演示看板时不使用本组件。
 */
import { Link } from "@tanstack/react-router";
import { Card, CardContent, Chip } from "@heroui/react";
import { PageHeading } from "@/components/biz";
import type { ProjectResponse } from "@/lib/api/types";

const STATUS_LABEL: Record<string, string> = {
  planning: "规划中",
  in_progress: "进行中",
  completed: "已完成",
  paused: "已暂停",
  cancelled: "已取消",
};

const TYPE_LABEL: Record<string, string> = {
  agile: "敏捷",
  waterfall: "瀑布",
  maintenance: "运维",
  hybrid: "混合",
};

function formatDate(ts: number | null): string {
  if (ts == null) return "未设置";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? "未设置" : date.toLocaleDateString("zh-CN");
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="type-meta">{label}</span>
      <span className="type-body break-words">{children}</span>
    </div>
  );
}

export function ProjectDetailView({ project }: { project: ProjectResponse }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title={project.projectName} hint={`项目详情 · 真实后端数据（GET /project/v1/findById/${project.id}）`} />
      <Card className="w-full">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip size="sm" color="accent" variant="soft">
              {project.projectKey}
            </Chip>
            <Chip size="sm" variant="soft">
              {TYPE_LABEL[project.projectType] ?? project.projectType}
            </Chip>
            <Chip size="sm" color="success" variant="soft">
              {STATUS_LABEL[project.status] ?? project.status}
            </Chip>
            {project.isArchived ? (
              <Chip size="sm" color="warning" variant="soft">
                已归档
              </Chip>
            ) : null}
          </div>
          {project.description ? <p className="type-body text-default-600">{project.description}</p> : null}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <InfoItem label="负责人">{project.projectManagerName ?? "未指定"}</InfoItem>
            <InfoItem label="成员数">{project.memberCount ?? 0} 人</InfoItem>
            <InfoItem label="开始日期">{formatDate(project.startDate)}</InfoItem>
            <InfoItem label="结束日期">{formatDate(project.endDate)}</InfoItem>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <InfoItem label="项目 ID">{project.id}</InfoItem>
            <InfoItem label="创建时间">{formatDate(project.createdAt)}</InfoItem>
            <InfoItem label="更新时间">{formatDate(project.updatedAt)}</InfoItem>
          </div>
        </CardContent>
      </Card>
      <Card className="w-full">
        <CardContent className="flex flex-wrap gap-2">
          <Link
            to="/p/$projectKey/dashboard"
            params={{ projectKey: project.projectKey }}
            className="type-body rounded-sm border border-border bg-surface px-3 py-2"
          >
            仪表盘
          </Link>
          <Link
            to="/p/$projectKey/requirements"
            params={{ projectKey: project.projectKey }}
            className="type-body rounded-sm border border-border bg-surface px-3 py-2"
          >
            需求
          </Link>
          <Link
            to="/p/$projectKey/issues"
            params={{ projectKey: project.projectKey }}
            className="type-body rounded-sm border border-border bg-surface px-3 py-2"
          >
            任务
          </Link>
          <Link
            to="/p/$projectKey/trace"
            params={{ projectKey: project.projectKey }}
            className="type-body rounded-sm border border-border bg-surface px-3 py-2"
          >
            追溯
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
