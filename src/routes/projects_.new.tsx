import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Button,
  Input,
  Label,
  TextArea,
  TextField,
} from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OptionSelect, PageHeading } from "@/components/biz";
import { FieldError, RequiredMark, useUnsavedChangesGuard } from "@/components/biz";
import { AppShell } from "@/components/pm/shell";
import { DemoCreateProject } from "@/components/pm/demo-create-project";
import { useAuthStore } from "@/lib/api/auth-store";
import { isCanonicalUserId } from "@/lib/api/auth";
import { projectApi } from "@/lib/api/project";
import { parseRequiredPositiveInt } from "@/lib/task-create";
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
  disabled,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
}) {
  return (
    <TextField value={value} onChange={onChange} isDisabled={disabled}>
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
  // Codex review 4175631825：跨 tab 切换账号后 hydrate() 会把 store 用户从 A 切到 B，
  // 但本组件的 useState 初始化器只在挂载时读了一次 A 的 userId，表单会残留 A 的
  // 经理 ID 并被 B 静默建出项目。跟踪初始化时的账号：账号变化且用户未手动改过
  // 该字段时，跟随新账号重置默认值；用户已手动编辑则保留其输入。
  const initUserIdRef = useRef(
    user && isCanonicalUserId(user.userId) ? user.userId : "",
  );
  const defaultManagerId = user && isCanonicalUserId(user.userId) ? user.userId : "";
  useEffect(() => {
    if (defaultManagerId !== initUserIdRef.current) {
      if (managerIdText === initUserIdRef.current) setManagerIdText(defaultManagerId);
      initUserIdRef.current = defaultManagerId;
    }
  }, [defaultManagerId, managerIdText]);
  const [description, setDescription] = useState("");
  const [keyExists, setKeyExists] = useState<boolean | null>(null);
  const [checkingKey, setCheckingKey] = useState(false);
  // 字段级校验错误：提交时按字段收集，展示在对应输入下方；编辑对应字段时清除
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearFieldError = (field: string) =>
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  // Codex review 4175472567：提交按钮只在 mutation 开始后才禁用，唯一性预检
  // 在途时表单仍可编辑/重复提交——两个 handler 可能各自通过检查、建出两个项目。
  // submitting 覆盖“预检 + 创建”整个异步操作，锁住期间禁止再次提交。
  const [submitting, setSubmitting] = useState(false);
  // Codex review 4175878112：提交 preflight（异步唯一性检查）期间表单字段可编辑，
  // 但 handleSubmit 已捕获提交时的旧值——用户在检查中途的改动会被静默丢弃。
  // 整个提交区间禁用全部表单控件，与提交按钮的禁用保持一致。
  const formDisabled = submitting || createProject.isPending;
  // Codex review 4175265689：可用性检查是异步的，过期的响应不能覆盖新输入
  // 的状态。每次检查递增代际，只有最新一次请求的响应才允许写回。
  const keyCheckGeneration = useRef(0);

  // dirty check：任一字段偏离初始值即视为脏。managerIdText 的初始值是挂载时
  // 的默认经理 ID（initUserIdRef 跟踪"用户未手动改过时的默认值"，跨账号跟随
  // 逻辑复用它），未改过即不脏。
  const isDirty =
    projectName !== "" ||
    projectKey !== "" ||
    description !== "" ||
    startIso !== "" ||
    endIso !== "" ||
    projectType !== PROJECT_CREATE_TYPES[0] ||
    managerIdText !== initUserIdRef.current;
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(isDirty);

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
    const generation = (keyCheckGeneration.current += 1);
    setCheckingKey(true);
    try {
      const exists = await projectApi.checkKeyExists(key);
      // 响应返回时若用户已触发更新的检查，本次结果过期，直接丢弃。
      if (keyCheckGeneration.current === generation) setKeyExists(exists);
    } catch {
      // 网络错误不阻断输入；提交时后端会再校验一次
      if (keyCheckGeneration.current === generation) setKeyExists(null);
    } finally {
      if (keyCheckGeneration.current === generation) setCheckingKey(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const name = projectName.trim();
    const key = projectKey.trim().toUpperCase();
    if (!name) nextErrors.projectName = "请填写项目名称";
    if (!key) nextErrors.projectKey = "请填写项目键";
    // 十进制严格解析：拒绝 1e3/0x10 等 JS 数字语法与超安全整数舍入
    const managerId = parseRequiredPositiveInt(managerIdText);
    if (managerId === null) nextErrors.managerIdText = "项目经理用户 ID 必须为正整数";
    if (startIso && endIso && startIso > endIso) nextErrors.dates = "开始日期不能晚于结束日期";
    setFieldErrors(nextErrors);
    // managerId === null 时必已记入 nextErrors；显式写出以便 TS 收窄
    if (Object.keys(nextErrors).length > 0 || managerId === null) return;
    setSubmitting(true);
    try {
      // 提交前再确认一次唯一性，堵住失焦校验与提交之间的竞态
      if (await projectApi.checkKeyExists(key)) {
        setFieldErrors({ projectKey: `项目键 ${key} 已存在，请换一个` });
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
      // 成功跳转是程序化离开：先 markClean 放行守卫（state 回落有延迟，ref 级别放行）
      markClean();
      void navigate({ to: "/projects" });
    } catch (error) {
      toast.error(toUserMessage(error, "创建项目失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 md:p-6">
      {blocker}
      {dialog}
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
          isDisabled={formDisabled}
          onChange={(value) => {
            setProjectKey(value.toUpperCase());
            setKeyExists(null);
            clearFieldError("projectKey");
            // Codex review 4175337057：输入变化即宣告在途检查过期——代际递增并
            // 清除 checkingKey，否则键 A 的待定响应会在用户改成键 B 后写回 B 的状态。
            keyCheckGeneration.current += 1;
            setCheckingKey(false);
          }}
          onBlur={() => void checkKeyUniqueness(projectKey)}
        >
          <Label>
            项目键<RequiredMark />
          </Label>
          <Input placeholder="OPS2" />
        </TextField>
        <FieldError message={fieldErrors.projectKey} />
        {checkingKey ? (
          <p className="text-xs text-faint">正在检查项目键是否可用…</p>
        ) : keyExists === true ? (
          <p className="text-xs text-danger">项目键已存在，请换一个</p>
        ) : null}
        <TextField
          value={projectName}
          onChange={(value) => {
            setProjectName(value);
            clearFieldError("projectName");
          }}
          isDisabled={formDisabled}
        >
          <Label>
            项目名称<RequiredMark />
          </Label>
          <Input placeholder="值班改进二期" />
        </TextField>
        <FieldError message={fieldErrors.projectName} />
        <OptionSelect
          label="项目类型"
          value={projectType}
          options={typeOptions}
          onChange={setProjectType}
          isDisabled={formDisabled}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <IsoDateInput
            label="开始日期"
            value={startIso}
            onChange={(value) => {
              setStartIso(value);
              clearFieldError("dates");
            }}
            disabled={formDisabled}
          />
          <IsoDateInput
            label="结束日期"
            value={endIso}
            onChange={(value) => {
              setEndIso(value);
              clearFieldError("dates");
            }}
            disabled={formDisabled}
          />
        </div>
        <FieldError message={fieldErrors.dates} />
        <TextField
          value={managerIdText}
          onChange={(value) => {
            setManagerIdText(value);
            clearFieldError("managerIdText");
          }}
          isDisabled={formDisabled}
        >
          <Label>
            项目经理用户 ID<RequiredMark />
          </Label>
          <Input inputMode="numeric" placeholder="填写后端用户 ID" />
        </TextField>
        <FieldError message={fieldErrors.managerIdText} />
        <TextField
          value={description}
          onChange={setDescription}
          isDisabled={formDisabled}
        >
          <Label>项目描述</Label>
          <TextArea placeholder="这个项目要解决什么" />
        </TextField>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            isDisabled={submitting || createProject.isPending || keyExists === true}
          >
            {submitting || createProject.isPending ? "创建中…" : "创建"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onPress={() => guard(() => void navigate({ to: "/projects" }))}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}

