import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Button,
  Input,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OptionSelect, PageHeading } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { DemoCreateProject } from "@/components/pm/demo-create-project";
import { useAuthStore } from "@/lib/api/auth-store";
import { isCanonicalUserId } from "@/lib/api/auth";
import { projectApi } from "@/lib/api/project";
import { PROJECT_CREATE_TYPES, type ProjectCreatePayload } from "@/lib/api/types";
import { toUserMessage, useCreateProject, useProjectEnums } from "@/lib/query";

export const Route = createFileRoute("/projects_/new")({
  component: Page,
});

/** P1 p1-store-migration：未登录演示已抽为 DemoCreateProject；本路由不再引用 usePm。 */
function Page() {
  const { hydrate } = useAuthStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  return (
    <AppShell>{isAuthenticated ? <LiveCreateProject /> : <DemoCreateProject />}</AppShell>
  );
}

/** 日期 ISO（yyyy-MM-dd）→ 当天本地 0 点的毫秒时间戳；空字符串 → null */
function isoToEpochMs(iso: string): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  return new Date(y, m - 1, d).getTime();
}

/** 起止日期输入：原生 date 输入（值即 yyyy-MM-dd ISO，可留空；见 isoToEpochMs 转换） */
function IsoDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  return (
    <TextField value={value} onChange={onChange}>
      <Label>{label}</Label>
      <Input type="date" />
    </TextField>
  );
}

/** 登录态：表单直接打到后端（p1-project-create 垂直切片） */
function LiveCreateProject() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { data: enums } = useProjectEnums();
  const createProject = useCreateProject();

  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [projectType, setProjectType] = useState<string>(PROJECT_CREATE_TYPES[0]);
  const [startIso, setStartIso] = useState("");
  const [endIso, setEndIso] = useState("");
  const [managerIdText, setManagerIdText] = useState(
    user && isCanonicalUserId(user.userId) ? user.userId : "",
  );
  const [description, setDescription] = useState("");
  const [keyExists, setKeyExists] = useState<boolean | null>(null);
  const [checkingKey, setCheckingKey] = useState(false);
  const [formError, setFormError] = useState("");

  const typeOptions =
    enums && enums.projectTypes.length > 0
      ? enums.projectTypes.map((option) => ({ id: option.value, label: option.label }))
      : PROJECT_CREATE_TYPES.map((value) => ({ id: value, label: value }));

  const checkKeyUniqueness = async (raw: string) => {
    const key = raw.trim().toUpperCase();
    if (!key) {
      setKeyExists(null);
      return;
    }
    setCheckingKey(true);
    try {
      setKeyExists(await projectApi.checkKeyExists(key));
    } catch {
      // 网络错误不阻断输入；提交时后端会再校验一次
      setKeyExists(null);
    } finally {
      setCheckingKey(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = projectName.trim();
    const key = projectKey.trim().toUpperCase();
    if (!name) {
      setFormError("请填写项目名称");
      return;
    }
    if (!key) {
      setFormError("请填写项目键");
      return;
    }
    const managerId = Number(managerIdText.trim());
    if (!Number.isSafeInteger(managerId) || managerId <= 0) {
      setFormError("项目经理用户 ID 必须为正整数");
      return;
    }
    if (startIso && endIso && startIso > endIso) {
      setFormError("开始日期不能晚于结束日期");
      return;
    }
    setFormError("");
    try {
      // 提交前再确认一次唯一性，堵住失焦校验与提交之间的竞态
      if (await projectApi.checkKeyExists(key)) {
        setFormError(`项目键 ${key} 已存在，请换一个`);
        return;
      }
      const payload: ProjectCreatePayload = {
        projectName: name,
        projectKey: key,
        description: description.trim(),
        projectType: projectType as ProjectCreatePayload["projectType"],
        startDate: isoToEpochMs(startIso),
        endDate: isoToEpochMs(endIso),
        projectManagerId: managerId,
      };
      await createProject.mutateAsync(payload);
      toast.success("已创建项目");
      void navigate({ to: "/projects" });
    } catch (error) {
      toast.error(toUserMessage(error, "创建项目失败"));
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6">
      <PageHeading
        title="新建项目"
        hint="直接创建到后端。项目键会用在事项编号上，创建后不能改。成员可稍后在项目设置里调整。"
      />
      <form
        className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <TextField
          value={projectKey}
          onChange={(value) => {
            setProjectKey(value.toUpperCase());
            setKeyExists(null);
          }}
          onBlur={() => void checkKeyUniqueness(projectKey)}
        >
          <Label>项目键</Label>
          <Input placeholder="OPS2" />
        </TextField>
        {checkingKey ? (
          <p className="text-xs text-faint">正在检查项目键是否可用…</p>
        ) : keyExists === true ? (
          <p className="text-xs text-danger">项目键已存在，请换一个</p>
        ) : null}
        <TextField value={projectName} onChange={setProjectName}>
          <Label>项目名称</Label>
          <Input placeholder="值班改进二期" />
        </TextField>
        <OptionSelect
          label="项目类型"
          value={projectType}
          options={typeOptions}
          onChange={setProjectType}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <IsoDateInput label="开始日期" value={startIso} onChange={setStartIso} />
          <IsoDateInput label="结束日期" value={endIso} onChange={setEndIso} />
        </div>
        <TextField value={managerIdText} onChange={setManagerIdText}>
          <Label>项目经理用户 ID</Label>
          <Input inputMode="numeric" placeholder="填写后端用户 ID" />
        </TextField>
        <TextField value={description} onChange={setDescription}>
          <Label>项目描述</Label>
          <TextArea placeholder="这个项目要解决什么" />
        </TextField>
        {formError ? <p className="text-xs text-danger">{formError}</p> : null}
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            isDisabled={createProject.isPending || keyExists === true}
          >
            {createProject.isPending ? "创建中…" : "创建"}
          </Button>
          <Button type="button" variant="outline" onPress={() => void navigate({ to: "/projects" })}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}

