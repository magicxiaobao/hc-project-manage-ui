import { notifyPmChange } from "@/lib/pm/feedback";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { EmptyHint, OptionSelect, PageHeading } from "@/components/biz";
import { cn } from "@/lib/utils";
import { PersistenceStatus } from "@/components/biz/persistence-status";
import { usePm } from "@/lib/pm/store";

export function SettingsView({ projectKey }: { projectKey: string }) {
  const project = usePm((state) => state.projects.find((entry) => entry.key === projectKey));
  const people = usePm((state) => state.people);
  const [name, setName] = useState(project?.name ?? "");
  const [summary, setSummary] = useState(project?.summary ?? "");
  const [members, setMembers] = useState<string[]>(project?.memberIds ?? []);
  const [leadId, setLeadId] = useState(project?.leadId ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [nameError, setNameError] = useState("");
  const [leadError, setLeadError] = useState("");
  const [missingError, setMissingError] = useState("");
  const nameErrorId = useId();
  const leadErrorId = useId();
  const missingErrorId = useId();
  const ready = usePm((state) => state.ready);
  const persistenceError = usePm((state) => state.persistenceError);
  if (!project) return <EmptyHint>没有找到这个项目。</EmptyHint>;
  const draft = name !== project.name || summary !== project.summary || leadId !== project.leadId || JSON.stringify(members) !== JSON.stringify(project.memberIds);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="项目设置" hint="名称、简介和成员留在这台浏览器里。项目键不能改。" />
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = usePm.getState().updateProject(project.id, { name, summary, memberIds: members, leadId });
          if (!result.ok) {
            toast.error(result.message);
            setNameError(result.message === "项目名称不能为空。" ? result.message : "");
            setLeadError(result.message === "负责人必须是项目成员。" ? result.message : "");
            if (result.message === "项目不存在。") setMissingError(result.message);
          } else {
            setNameError("");
            setLeadError("");
            setMissingError("");
            const accepted = usePm.getState().projects.find((entry) => entry.id === project.id);
            if (accepted) {
              setName(accepted.name);
              setSummary(accepted.summary);
            }
            setSubmitted(true);
            notifyPmChange("已保存项目设置");
          }
        }}
      >
        <TextField
          value={name}
          isInvalid={Boolean(nameError)}
          onChange={(next) => {
            setName(next);
            if (nameError) setNameError("");
          }}
        >
          <Label>名称</Label>
          <Input aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? nameErrorId : undefined} />
          {nameError ? (
            <p id={nameErrorId} role="alert" className="type-body text-danger">
              {nameError}
            </p>
          ) : null}
        </TextField>
        <TextField value={summary} onChange={setSummary}>
          <Label>简介</Label>
          <TextArea />
        </TextField>
        <div>
          <div className="type-label mb-2">成员</div>
          <p className="type-caption mb-2">负责人只有一个。取消成员前要先换负责人。</p>
          <div className="flex flex-wrap gap-2">
            {people.map((person) => {
              const on = members.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={on}
                  className={cn("type-emphasis rounded-sm border px-3 py-1.5", on ? "border-primary bg-primary/10 text-primary" : "border-border")}
                  onClick={() =>
                    setMembers((current) => {
                      if (current.includes(person.id)) {
                        if (person.id === leadId) return current;
                        return current.filter((id) => id !== person.id);
                      }
                      return [...current, person.id];
                    })
                  }
                >
                  {person.name}
                  {person.id === leadId ? " · 负责人" : on ? " · 成员" : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <OptionSelect
            label="负责人"
            value={leadId}
            aria-invalid={Boolean(leadError)}
            aria-describedby={leadError ? leadErrorId : undefined}
            options={people.filter((person) => members.includes(person.id)).map((person) => ({ id: person.id, label: person.name }))}
            onChange={(next) => {
              setLeadId(next);
              if (leadError) setLeadError("");
            }}
          />
          {leadError ? (
            <p id={leadErrorId} role="alert" className="type-body text-danger">
              {leadError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" aria-describedby={missingError ? missingErrorId : undefined}>
            保存
          </Button>
          {missingError ? (
            <p id={missingErrorId} role="alert" className="type-body text-danger">
              {missingError}
            </p>
          ) : null}
        </div>
        <PersistenceStatus ready={ready} error={persistenceError} draft={draft} saved={submitted} onRetry={() => usePm.getState().retryPersistence()} />
      </form>
    </div>
  );
}
