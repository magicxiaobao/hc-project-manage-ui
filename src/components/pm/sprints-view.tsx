import { notifyPmChange } from "@/lib/pm/feedback";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DayField, EmptyHint, OptionSelect, PageHeading, SprintStateChip, StateAction } from "@/components/biz";
import { formatDay } from "@/lib/pm/domain";
import { usePm } from "@/lib/pm/store";

function BoardNameRow({ id, name, sprint }: { id: string; name: string; sprint: string }) {
  const [value, setValue] = useState(name);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const result = usePm.getState().renameBoard(id, value);
        if (!result.ok) toast.error(result.message);
        else notifyPmChange("已保存看板名称");
      }}
    >
      <TextField className="min-w-48 flex-1" value={value} onChange={setValue}>
        <Label>看板名称</Label>
        <Input aria-label={`${name}的名称`} />
      </TextField>
      <span className="type-caption pb-2">{sprint}</span>
      <Button type="submit" variant="primary" isDisabled={value.trim() === name}>
        保存
      </Button>
    </form>
  );
}

export function SprintsView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const sprints = usePm((state) => state.sprints);
  const boards = usePm((state) => state.boards);
  const projectSprints = useMemo(() => sprints.filter((entry) => entry.projectId === project?.id), [sprints, project?.id]);
  const projectBoards = useMemo(() => boards.filter((entry) => entry.projectId === project?.id), [boards, project?.id]);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [start, setStart] = useState("2026-10-27");
  const [end, setEnd] = useState("2026-11-07");
  const [boardName, setBoardName] = useState("");
  const [boardSprint, setBoardSprint] = useState("");
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="迭代" hint="一个项目可以有多块看板。看板绑定一个迭代，或看全部事项。" />
      {projectSprints.filter((sprint) => sprint.state !== "closed").map((sprint) => (
        <section key={sprint.id} className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-section">{sprint.name}</h2>
            <SprintStateChip state={sprint.state} />
            <span className="type-caption">
              {formatDay(sprint.start)} – {formatDay(sprint.end)}
            </span>
          </div>
          <p className="type-body">{sprint.goal}</p>
          <div className="flex gap-2">
            {sprint.state === "planned" ? (
              <Button
                variant="primary"
                onPress={() => {
                  const result = usePm.getState().startSprint(sprint.id);
                  if (!result.ok) toast.error(result.message);
                }}
              >
                开始
              </Button>
            ) : null}
            {sprint.state === "active" ? (
              <StateAction tone="done" onPress={() => {
                const result = usePm.getState().completeSprint(sprint.id);
                if (!result.ok) toast.error(result.message);
              }}>
                完成
              </StateAction>
            ) : null}
          </div>
        </section>
      ))}
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">已完成迭代 · {projectSprints.filter((sprint) => sprint.state === "closed").length}</summary>
<div className="flex flex-col gap-3 p-3">
      {projectSprints.filter((sprint) => sprint.state === "closed").map((sprint) => (
        <section key={sprint.id} className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-section">{sprint.name}</h2>
            <SprintStateChip state={sprint.state} />
            <span className="type-caption">
              {formatDay(sprint.start)} – {formatDay(sprint.end)}
            </span>
          </div>
          <p className="type-body">{sprint.goal}</p>
          <div className="flex gap-2">
            {sprint.state === "planned" ? (
              <Button
                variant="primary"
                onPress={() => {
                  const result = usePm.getState().startSprint(sprint.id);
                  if (!result.ok) toast.error(result.message);
                }}
              >
                开始
              </Button>
            ) : null}
            {sprint.state === "active" ? (
              <StateAction tone="done" onPress={() => {
                const result = usePm.getState().completeSprint(sprint.id);
                if (!result.ok) toast.error(result.message);
              }}>
                完成
              </StateAction>
            ) : null}
          </div>
        </section>
      ))}

</div>
</details>
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">新建迭代</summary>
<div className="flex flex-col gap-3 p-3">
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField value={name} onChange={setName}>
            <Label>名称</Label>
            <Input placeholder="Sprint 26" />
          </TextField>
          <TextField value={goal} onChange={setGoal}>
            <Label>目标</Label>
            <Input placeholder="这轮要交付什么" />
          </TextField>
          <DayField label="开始" value={start} onChange={setStart} />
          <DayField label="结束" value={end} onChange={setEnd} />
        </div>
        <div>
          <Button
            variant="primary"
            onPress={() => {
              const result = usePm.getState().createSprint({ projectId: project.id, name, goal, start, end });
              if (!result.ok) toast.error(result.message);
              else {
                setName("");
                setGoal("");
                notifyPmChange("已添加迭代");
              }
            }}
          >
            添加迭代
          </Button>
        </div>
      </section>

<button type="button" className="type-body min-h-10 self-start rounded-sm border border-border px-3 py-2" onClick={(event) => { const panel = event.currentTarget.closest("details"); panel?.removeAttribute("open"); panel?.querySelector("summary")?.focus(); }}>收起（保留草稿）</button>
</div>
</details>
<details className="rounded-sm border border-border bg-surface">
<summary className="type-section cursor-pointer rounded-sm px-3 py-3 focus-visible:outline-2 focus-visible:outline-primary">看板管理 · {projectBoards.length}</summary>
<div className="flex flex-col gap-3 p-3">
      <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section">看板</h2>
        {projectBoards.map((board) => (
          <BoardNameRow
            key={board.id}
            id={board.id}
            name={board.name}
            sprint={projectSprints.find((sprint) => sprint.id === board.sprintId)?.name ?? "全部事项"}
          />
        ))}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField value={boardName} onChange={setBoardName}>
            <Label>看板名称</Label>
            <Input placeholder="缺陷看板" />
          </TextField>
          <OptionSelect
            label="迭代"
            value={boardSprint}
            options={[{ id: "", label: "全部事项" }, ...projectSprints.map((sprint) => ({ id: sprint.id, label: sprint.name }))]}
            onChange={setBoardSprint}
          />
        </div>
        <div>
          <Button
            variant="primary"
            onPress={() => {
              const result = usePm.getState().createBoard({ projectId: project.id, name: boardName, sprintId: boardSprint || null });
              if (!result.ok) toast.error(result.message);
              else {
                setBoardName("");
                notifyPmChange("已添加看板");
              }
            }}
          >
            添加看板
          </Button>
        </div>
      </section>

<button type="button" className="type-body min-h-10 self-start rounded-sm border border-border px-3 py-2" onClick={(event) => { const panel = event.currentTarget.closest("details"); panel?.removeAttribute("open"); panel?.querySelector("summary")?.focus(); }}>收起（保留草稿）</button>
</div>
</details>
    </div>
  );
}
