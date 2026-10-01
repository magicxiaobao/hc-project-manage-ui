import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeading, PersonSelect } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { usePm } from "@/lib/pm/store";

export const Route = createFileRoute("/projects_/new")({
  component: Page,
});

function Page() {
  return (
    <AppShell>
      <CreateProject />
    </AppShell>
  );
}

function CreateProject() {
  const navigate = useNavigate();
  const people = usePm((state) => state.people);
  const currentUserId = usePm((state) => state.currentUserId);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [leadId, setLeadId] = useState(currentUserId);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6">
      <PageHeading title="新建项目" hint="项目键会用在事项编号上，创建后不能改。成员可稍后在项目设置里调整。" />
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = usePm.getState().createProject({ key, name, summary, leadId });
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          toast("已创建项目");
          void navigate({ to: "/p/$projectKey", params: { projectKey: result.key } });
        }}
      >
        <TextField value={key} onChange={(value) => setKey(value.toUpperCase())}>
          <Label>项目键</Label>
          <Input placeholder="OPS2" />
        </TextField>
        <TextField value={name} onChange={setName}>
          <Label>名称</Label>
          <Input placeholder="值班改进二期" />
        </TextField>
        <TextField value={summary} onChange={setSummary}>
          <Label>简介</Label>
          <TextArea placeholder="这个项目要解决什么" />
        </TextField>
        <PersonSelect label="负责人" people={people} value={leadId} allowEmpty={false} showRole onChange={setLeadId} />
        <div className="flex gap-2">
          <Button type="submit" variant="primary">
            创建
          </Button>
          <Button type="button" variant="outline" onPress={() => void navigate({ to: "/projects" })}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
