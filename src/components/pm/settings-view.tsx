import { notifyPmChange } from "@/lib/pm/feedback";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyHint, PageHeading } from "@/components/biz";
import { cn } from "@/lib/utils";
import { usePm } from "@/lib/pm/store";

export function SettingsView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const people = usePm((state) => state.people);
  const [name, setName] = useState(project?.name ?? "");
  const [summary, setSummary] = useState(project?.summary ?? "");
  const [members, setMembers] = useState<string[]>(project?.memberIds ?? []);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="项目设置" hint="名称、简介和成员留在这台浏览器里。项目键不能改。" />
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = usePm.getState().updateProject(project.id, { name, summary, memberIds: members });
          if (!result.ok) toast.error(result.message);
          else notifyPmChange("已保存项目设置");
        }}
      >
        <TextField value={name} onChange={setName}>
          <Label>名称</Label>
          <Input />
        </TextField>
        <TextField value={summary} onChange={setSummary}>
          <Label>简介</Label>
          <TextArea />
        </TextField>
        <div>
          <div className="type-label mb-2">成员</div>
          <div className="flex flex-wrap gap-2">
            {people.map((person) => {
              const on = members.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={on}
                  className={cn("type-emphasis rounded-sm border px-3 py-1.5", on ? "border-primary bg-primary/10 text-primary" : "border-border")}
                  onClick={() => setMembers((current) => (current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]))}
                >
                  {person.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary">
            保存
          </Button>
        </div>
      </form>
    </div>
  );
}
