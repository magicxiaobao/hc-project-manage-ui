import { ProgressBar } from "@heroui/react";

export function PointsBar({ done, total, count }: { done: number; total: number; count: number }) {
  const ratio = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <ProgressBar aria-label="迭代故事点" value={ratio} minValue={0} maxValue={100} size="sm">
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      <p className="type-caption mt-2">
        故事点 {done}/{total} 已完成 · {count} 个事项
      </p>
    </div>
  );
}
