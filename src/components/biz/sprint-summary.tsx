import { Button } from "@heroui/react";
import { PointsBar } from "@/components/biz/points-bar";

export function SprintSummary({
  name,
  goal,
  done,
  total,
  count,
  onOpen,
}: {
  name: string;
  goal?: string;
  done: number;
  total: number;
  count: number;
  onOpen: () => void;
}) {
  return (
    <section className="rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-section">{name}</h2>
        <Button size="sm" variant="ghost" onPress={onOpen}>
          打开看板
        </Button>
      </div>
      {goal ? <p className="type-meta mt-1">{goal}</p> : null}
      <div className="mt-4">
        <PointsBar done={done} total={total} count={count} />
      </div>
    </section>
  );
}
