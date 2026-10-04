/**
 * 未登录演示：项目创建走 usePm 本地种子数据（createProject）。
 *
 * P1 p1-store-migration：登录态项目创建已迁移为 react-query useCreateProject
 *（LiveCreateProject，见 src/routes/projects_.new.tsx），不再引用本 store。
 * 本组件是唯一仍调用 usePm().createProject 的项目域组件，仅供未登录演示路径使用。
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { toast } from "sonner";
import { PageHeading, PersonSelect } from "@/components/biz";
import { notifyPmChange } from "@/lib/pm/feedback";
import { usePm } from "@/lib/pm/store";

export function DemoCreateProject() {
  const navigate = useNavigate();
  const people = usePm((state) => state.people);
  const currentUserId = usePm((state) => state.currentUserId);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [leadId, setLeadId] = useState(currentUserId);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="新建项目"
        hint="未登录：只创建到浏览器本地演示数据。登录后可创建真实后端项目。"
      />
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = usePm.getState().createProject({ key, name, summary, leadId });
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          notifyPmChange("已创建项目");
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
        <PersonSelect
          label="负责人"
          people={people}
          value={leadId}
          allowEmpty={false}
          showRole
          onChange={setLeadId}
        />
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
