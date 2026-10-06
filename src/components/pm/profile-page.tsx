/**
 * 个人中心页（P5：p5-user-profile），路由 /sys/profile。
 *
 * - 个人资料只读展示：头像 + 用户名/姓名/邮箱/电话/部门/岗位/最后登录
 *   （GET /user/v1/findById/{id}，id 取当前登录用户）；
 * - 头像上传：POST /user/v1/profile/avatar（multipart file），前端按后端
 *   UserAvatarService 语义预检（JPEG/PNG、1B~2MiB），成功后失效头像查询缓存
 *   重新拉取；预览走 GET /user/v1/{userId}/avatar/content（原始字节流），
 *   无头像时后端 400 → 降级为占位头像（systemApi.user.getAvatarContent）；
 * - 修改密码：POST /user/v1/changePassword { id, oldPassword, newPassword }；
 *   表单 UX 硬约定：useUnsavedChangesGuard dirty check（返回/路由跳转/
 *   浏览器后退/刷新/关闭标签页）、RequiredMark 必填星号（含读屏器"必填"）、
 *   FieldError 字段级错误（收集全部不首错即停、编辑即清）、两次输入不一致
 *   挂 confirmPassword、原密码错误挂 oldPassword（后端语义见 user-profile.ts）。
 *
 * 后端契约要点（已实读 backend-ro）：changePassword 无方法级 @PreAuthorize，
 * 继承 UserController 类级 hasAuthority('system:admin')，故本页放在 /sys 下
 * 并复用与 /sys/users 相同的布局守卫（见 routes/sys/profile.tsx）。
 */
import { useEffect, useRef, useState } from "react";
import { Avatar, Button, Input, Label, Spinner, TextField } from "@heroui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  FieldError,
  PageHeading,
  RequiredMark,
  useUnsavedChangesGuard,
} from "@/components/biz";
import { systemApi } from "@/lib/api/system";
import { ApiBusinessError } from "@/lib/api/client";
import { hasSystemAdmin, useAuthStore } from "@/lib/api/auth-store";
import {
  avatarQueryKey,
  buildChangePasswordPayload,
  classifyChangePasswordError,
  emptyChangePasswordInput,
  parseUserId,
  refreshAvatarAfterUpload,
  validateAvatarFile,
  validateChangePasswordInput,
  type ChangePasswordField,
  type ChangePasswordFormInput,
} from "@/lib/user-profile";

function ProfileRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="type-label mb-1">{label}</div>
      <div className="type-body">{value && value.trim() ? value : "—"}</div>
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);
  const userId = parseUserId(authUser?.userId);
  const apiAllowed = hasSystemAdmin(authUser?.authorities);

  // ---- 个人资料 ----
  const profileQuery = useQuery({
    queryKey: ["hc", "system", "detail", userId],
    queryFn: () => systemApi.user.findById(userId as number),
    enabled: apiAllowed && userId != null,
  });

  // ---- 头像预览（原始字节流；无头像后端 400 → getAvatarContent 抛错 → 占位） ----
  const avatarQuery = useQuery({
    queryKey: userId != null ? avatarQueryKey(userId) : ["hc", "system", "avatar", "none"],
    queryFn: () => systemApi.user.getAvatarContent(userId as number),
    enabled: apiAllowed && userId != null,
    // 无头像是预期状态（400 降级占位），不是瞬时故障：不重试
    retry: false,
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!avatarQuery.data) {
      setAvatarUrl(null);
      return;
    }
    const url = URL.createObjectURL(avatarQuery.data);
    setAvatarUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarQuery.data]);

  // ---- 头像上传 ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file || userId == null || uploading) return;
    const precheck = validateAvatarFile(file);
    if (precheck) {
      setAvatarError(precheck);
      return;
    }
    setAvatarError(null);
    setUploading(true);
    try {
      await systemApi.user.uploadProfileAvatar(file);
      // 上传成功后刷新：先取消在途旧 GET 再失效重取，避免旧响应晚到覆盖新头像
      await refreshAvatarAfterUpload(queryClient, userId);
      toast.success("头像上传成功");
    } catch (err) {
      // 后端文案已是用户可读的（"头像只允许 JPEG/PNG" 等），直接展示
      const message =
        err instanceof ApiBusinessError ? err.message : "头像上传失败，请稍后重试";
      setAvatarError(message);
    } finally {
      setUploading(false);
      // 允许重复选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---- 修改密码表单 ----
  const [form, setForm] = useState<ChangePasswordFormInput>(emptyChangePasswordInput());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ChangePasswordField, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (patch: Partial<ChangePasswordFormInput>) => {
    setForm((current) => ({ ...current, ...patch }));
    // 编辑即清除该字段错误（表单 UX 硬约定）；submit 级错误同样在编辑时清除
    setFieldErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of Object.keys(patch) as ChangePasswordField[]) {
        if (next[key] !== undefined) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setSubmitError(null);
  };

  const isDirty =
    form.oldPassword !== "" || form.newPassword !== "" || form.confirmPassword !== "";
  // 整页表单：blocker 拦截路由跳转 + 浏览器刷新/关闭；dialog 供主动离开动作确认
  const { guard, dialog, blocker, markClean } = useUnsavedChangesGuard(isDirty);

  const handleSubmit = async () => {
    if (busy || uploading || userId == null) return;
    // 收集全部错误，不首错即停
    const errors = validateChangePasswordInput(form);
    if (errors.length > 0) {
      setFieldErrors(Object.fromEntries(errors.map((e) => [e.field, e.message])));
      return;
    }
    setFieldErrors({});
    setSubmitError(null);
    setBusy(true);
    try {
      await systemApi.user.changePassword(buildChangePasswordPayload(userId, form));
      // 成功=已授权离开：先 markClean 再重置，避免守卫拦截（state 回落前的 ref 级放行）
      markClean();
      setForm(emptyChangePasswordInput());
      toast.success("密码修改成功");
    } catch (err) {
      const classified = classifyChangePasswordError(err);
      if (classified.field === "submit") {
        setSubmitError(classified.message);
      } else {
        setFieldErrors({ [classified.field]: classified.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    guard(() => {
      void navigate({ to: "/projects" });
    });
  };

  const profile = profileQuery.data;
  const displayName = profile?.cnName || profile?.username || authUser?.cnName || authUser?.userName || "—";
  const avatarInitial = displayName.slice(-2);

  if (!apiAllowed) return <p className="p-6">该操作需要系统管理员权限。当前后端个人资料接口尚不支持细粒度权限。</p>;

  // 单一返回路径：blocker 在加载/错误态同样挂载，守卫不离线
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      {blocker}
      {dialog}
      <div>
        <Button variant="ghost" onPress={handleBack}>
          ← 返回项目列表
        </Button>
      </div>
      <PageHeading title="个人中心" hint="查看个人资料、更换头像与修改登录密码。" />

      {/* 个人资料（只读展示） */}
      <section aria-label="个人资料" className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section mb-4">个人资料</h2>
        {profileQuery.isPending ? (
          <div className="flex items-center gap-2 py-6">
            <Spinner size="sm" aria-label="加载中" />
            <span className="type-meta">正在加载个人资料…</span>
          </div>
        ) : profileQuery.isError || !profile ? (
          <div className="py-4">
            <p className="type-body text-danger" role="alert">
              个人资料加载失败，请稍后重试。
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onPress={() => void profileQuery.refetch()}
            >
              重试
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar size="lg" aria-label={`${displayName}的头像`}>
                {avatarQuery.data && avatarUrl ? (
                  <Avatar.Image src={avatarUrl} alt={`${displayName}的头像`} />
                ) : null}
                <Avatar.Fallback>{avatarInitial}</Avatar.Fallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  aria-label="选择头像文件"
                  onChange={(e) => void handleAvatarFile(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  isDisabled={uploading || userId == null}
                  onPress={() => fileInputRef.current?.click()}
                >
                  {uploading ? "上传中…" : "更换头像"}
                </Button>
                <span className="type-meta">仅支持 JPEG/PNG，大小不超过 2 MiB</span>
              </div>
            </div>
            {avatarError ? (
              <p role="alert" className="text-xs text-danger">
                {avatarError}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ProfileRow label="用户名" value={profile.username} />
              <ProfileRow label="姓名" value={profile.cnName} />
              <ProfileRow label="邮箱" value={profile.email} />
              <ProfileRow label="电话" value={profile.phone} />
              <ProfileRow label="部门" value={profile.departmentName} />
              <ProfileRow label="岗位" value={profile.positionName} />
              <ProfileRow label="管理员" value={profile.admin ? "是" : "否"} />
              <ProfileRow
                label="最后登录"
                value={profile.lastLoginTime ? profile.lastLoginTime.replace("T", " ") : null}
              />
            </div>
          </div>
        )}
      </section>

      {/* 修改密码 */}
      <section aria-label="修改密码" className="rounded-sm border border-border bg-surface p-4">
        <h2 className="type-section mb-4">修改密码</h2>
        {submitError ? (
          <p role="alert" className="mb-4 rounded-sm bg-danger/10 p-3 text-sm text-danger">
            {submitError}
          </p>
        ) : null}
        <div className="flex flex-col gap-4">
          <div>
            <TextField
              value={form.oldPassword}
              onChange={(next) => setField({ oldPassword: next })}
              isDisabled={busy}
              aria-label="原密码（必填）"
            >
              <Label>
                原密码<RequiredMark />
              </Label>
              <Input type="password" placeholder="请输入原密码" autoComplete="current-password" />
            </TextField>
            <FieldError message={fieldErrors.oldPassword} />
          </div>
          <div>
            <TextField
              value={form.newPassword}
              onChange={(next) => setField({ newPassword: next })}
              isDisabled={busy}
              aria-label="新密码（必填）"
            >
              <Label>
                新密码<RequiredMark />
              </Label>
              <Input type="password" placeholder="至少 8 位" autoComplete="new-password" />
            </TextField>
            <FieldError message={fieldErrors.newPassword} />
          </div>
          <div>
            <TextField
              value={form.confirmPassword}
              onChange={(next) => setField({ confirmPassword: next })}
              isDisabled={busy}
              aria-label="确认新密码（必填）"
            >
              <Label>
                确认新密码<RequiredMark />
              </Label>
              <Input type="password" placeholder="再次输入新密码" autoComplete="new-password" />
            </TextField>
            <FieldError message={fieldErrors.confirmPassword} />
          </div>
          <div className="flex justify-end">
            {/* run207-codex-P5-r22-2：上传头像期间禁用提交——handleSubmit 在 uploading 时直接返回，
                按钮可点但无响应是 bug；禁用条件与守卫保持一致 */}
            <Button
              variant="primary"
              isDisabled={busy || uploading || userId == null}
              onPress={() => void handleSubmit()}
            >
              {busy ? "提交中…" : "修改密码"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
