import { Label, TextField, Input } from "@heroui/react";
import { nextStatuses, transitionName, type WorkItem } from "@/lib/pm/domain";
import { StateAction } from "@/components/biz/state-action";
import { transitionTone } from "@/components/biz/state-tone";

export function TransitionBar({
  item,
  pending,
  reason,
  onPick,
  onReason,
  onConfirm,
  onCancel,
}: {
  item: WorkItem;
  pending: string | null;
  reason: string;
  onPick: (status: string) => void;
  onReason: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const transitions = nextStatuses(item);
  const pendingTone = pending ? transitionTone(item.kind, pending) : "neutral";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {transitions.length === 0 ? <span className="type-caption">没有可继续的流转</span> : null}
        {transitions.map((to) => (
          <StateAction key={to} tone={transitionTone(item.kind, to)} active={pending === to} onPress={() => onPick(to)}>
            {transitionName(item.kind, item.status, to)}
          </StateAction>
        ))}
      </div>
      {pending ? (
        <form
          className="mt-3 flex flex-col gap-2 rounded-sm bg-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <TextField value={reason} onChange={onReason}>
            <Label>{transitionName(item.kind, item.status, pending)}需要原因</Label>
            <Input placeholder="写给生命周期历史" />
          </TextField>
          <div className="flex gap-2">
            <StateAction type="submit" tone={pendingTone} active>
              确认流转
            </StateAction>
            <StateAction type="button" tone="neutral" onPress={onCancel}>
              取消
            </StateAction>
          </div>
        </form>
      ) : null}
    </div>
  );
}
