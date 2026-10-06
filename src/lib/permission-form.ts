import type {
  PermissionCreatePayload,
  PermissionResponse,
  PermissionUpdatePayload,
  PermissionQuery,
} from "./api/system-types";
import type { PageRequest, PageResult } from "./api/types";
import { ApiBusinessError } from "./api/client";
import { toUserMessage } from "./query/error";
import { isPermissionId } from "./role-permissions";

export const PERMISSION_PAGE_SIZE = 100;
export const PERMISSION_DISPLAY_PAGE_SIZE = 20;
export const PERMISSION_TYPES = [
  { id: "MENU", label: "菜单" },
  { id: "BUTTON", label: "按钮" },
  { id: "API", label: "接口" },
  { id: "DATA", label: "数据" },
];
export interface PermissionFormInput {
  permissionName: string;
  permissionCode: string;
  permissionType: string;
  groupName: string;
  description: string;
  enabled: boolean | null;
}
export function emptyPermissionFormInput(): PermissionFormInput {
  return {
    permissionName: "",
    permissionCode: "",
    permissionType: "",
    groupName: "",
    description: "",
    enabled: true,
  };
}
export function permissionFormInputFromResponse(data: PermissionResponse): PermissionFormInput {
  return {
    permissionName: data.permissionName ?? "",
    permissionCode: data.permissionCode ?? "",
    permissionType: data.permissionType ?? "",
    groupName: data.groupName ?? "",
    description: data.description ?? "",
    enabled: data.enabled,
  };
}
export function permissionFormSnapshot(form: PermissionFormInput): string {
  return JSON.stringify([
    form.permissionName,
    form.permissionCode,
    form.permissionType,
    form.groupName,
    form.description,
    form.enabled,
  ]);
}
export interface PermissionFormFieldError {
  field: keyof PermissionFormInput;
  message: string;
}
export function validatePermissionFormInput(form: PermissionFormInput): PermissionFormFieldError[] {
  const errors: PermissionFormFieldError[] = [];
  for (const [field, label] of [
    ["permissionName", "权限名称"],
    ["permissionCode", "权限编码"],
  ] as const) {
    const value = form[field].trim();
    if (!value) errors.push({ field, message: `请输入${label}` });
    else if (value.length > 100) errors.push({ field, message: `${label}不能超过100个字符` });
  }
  if (!form.permissionType) errors.push({ field: "permissionType", message: "请选择权限类型" });
  else if (!PERMISSION_TYPES.some((type) => type.id === form.permissionType))
    errors.push({ field: "permissionType", message: "请选择支持的权限类型" });
  if (form.groupName.trim().length > 100)
    errors.push({ field: "groupName", message: "所属分组不能超过100个字符" });
  if (form.description.length > 500)
    errors.push({ field: "description", message: "描述不能超过500个字符" });
  return errors;
}
export function buildPermissionCreatePayload(form: PermissionFormInput): PermissionCreatePayload {
  return {
    permissionName: form.permissionName.trim(),
    permissionCode: form.permissionCode.trim(),
    permissionType: form.permissionType,
    groupName: form.groupName.trim(),
    description: form.description,
    enabled: form.enabled,
  };
}
export function buildPermissionUpdatePayload(
  id: number,
  form: PermissionFormInput,
): PermissionUpdatePayload {
  return { id, ...buildPermissionCreatePayload(form) };
}
export function rebasePermissionFormOnVersionConflict({
  baseline,
  current,
  server,
}: {
  baseline: PermissionFormInput | null;
  current: PermissionFormInput;
  server: PermissionFormInput;
}): PermissionFormInput {
  const base = baseline ?? server;
  return {
    permissionName:
      current.permissionName !== base.permissionName
        ? current.permissionName
        : server.permissionName,
    permissionCode:
      current.permissionCode !== base.permissionCode
        ? current.permissionCode
        : server.permissionCode,
    permissionType:
      current.permissionType !== base.permissionType
        ? current.permissionType
        : server.permissionType,
    groupName: current.groupName !== base.groupName ? current.groupName : server.groupName,
    description:
      current.description !== base.description ? current.description : server.description,
    enabled: current.enabled !== base.enabled ? current.enabled : server.enabled,
  };
}
/** 查询不使用 bean。完整读取失败时拒绝整份结果；传输过程不提供事务快照。 */
export async function readAllPermissionPages(
  fetchPage: (request: PageRequest<PermissionQuery>) => Promise<PageResult<PermissionResponse>>,
): Promise<PermissionResponse[]> {
  const records = new Map<number, PermissionResponse>();
  const signatures = new Set<string>();
  let actualSize: number | null = null;
  for (let page = 1; ; page++) {
    const result = await fetchPage({ page, pageSize: PERMISSION_PAGE_SIZE, bean: {} });
    if (
      result.pageNumber !== page ||
      !Number.isSafeInteger(result.pageSize) ||
      result.pageSize <= 0 ||
      !Array.isArray(result.list) ||
      result.list.length > result.pageSize
    ) {
      throw new Error("权限分页响应异常，请重新加载");
    }
    if (actualSize !== null && actualSize !== result.pageSize)
      throw new Error("权限分页大小发生变化，请重新加载");
    actualSize = result.pageSize;
    if (result.list.some((row) => !isPermissionId(row.id)))
      throw new Error("权限 ID 数据异常，请重新加载");
    const signature = JSON.stringify(result.list.map((row) => row.id).sort((a, b) => a - b));
    if (result.list.length && signatures.has(signature))
      throw new Error("权限分页重复，请重新加载");
    signatures.add(signature);
    const before = records.size;
    result.list.forEach((row) => records.set(row.id, row));
    if (result.list.length < result.pageSize) break;
    if (records.size === before) throw new Error("权限分页未推进，请重新加载");
  }
  return [...records.values()].sort((a, b) => a.id - b.id);
}
export interface PermissionFilters {
  permissionCode: string;
  permissionType: string;
  groupName: string;
}
export function emptyPermissionFilters(): PermissionFilters {
  return { permissionCode: "", permissionType: "", groupName: "" };
}
export function filterPermissionsLocal(
  rows: PermissionResponse[],
  filters: PermissionFilters,
): PermissionResponse[] {
  const code = filters.permissionCode.trim().toLowerCase();
  const group = filters.groupName.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (row.permissionCode ?? "").toLowerCase().includes(code) &&
      (row.groupName ?? "").toLowerCase().includes(group) &&
      (!filters.permissionType || row.permissionType === filters.permissionType),
  );
}
export function paginatePermissions(rows: PermissionResponse[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PERMISSION_DISPLAY_PAGE_SIZE));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  return {
    page,
    totalPages,
    total: rows.length,
    rows: rows.slice(
      (page - 1) * PERMISSION_DISPLAY_PAGE_SIZE,
      page * PERMISSION_DISPLAY_PAGE_SIZE,
    ),
  };
}
/** 近似常见大小写差异；数据库 UNIQUE 才是最终裁决。禁用记录也占用编码。 */
export function isPermissionCodeTaken(
  rows: Pick<PermissionResponse, "id" | "permissionCode">[],
  code: string,
  selfId: number | null,
): boolean {
  const target = code.trim().toLowerCase();
  return rows.some(
    (row) => row.id !== selfId && (row.permissionCode ?? "").trim().toLowerCase() === target,
  );
}
export function decidePermissionPrecheckFailure() {
  return { permissionCodeError: "权限编码已存在", clearOverall: true, overallError: null };
}
export function decidePermissionSubmitFailure(error: unknown, isCreate: boolean) {
  const detail = toUserMessage(error);
  if (error instanceof ApiBusinessError && (error.code === 10002 || error.code === 10003)) {
    return {
      permissionCodeError: `该权限编码可能已被占用，也可能是其他保存错误，请检查后重试：${detail}`,
      clearOverall: true,
      overallError: null,
    };
  }
  return {
    permissionCodeError: "提交失败，请检查表单后重试",
    clearOverall: false,
    overallError: `${isCreate ? "创建" : "更新"}失败：${detail}`,
  };
}
export function permissionText(value: string | null): string {
  return value?.trim() ? value : "—";
}
export function permissionTypeLabel(value: string | null): string {
  return PERMISSION_TYPES.find((type) => type.id === value)?.label ?? permissionText(value);
}
export function permissionGroupLabel(value: string | null): string {
  return value?.trim() || "未分组";
}
export function permissionStatusLabel(value: boolean | null): string {
  return value === null ? "未设置" : value ? "启用" : "禁用";
}
export function formatPermissionTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}
export type PermissionAction = "valid" | "invalid" | "delete";
export function permissionActionCopy(action: PermissionAction, row: PermissionResponse) {
  const verb = { valid: "启用", invalid: "禁用", delete: "删除" }[action];
  const effect = {
    valid: "启用后将出现在角色权限分配树中；不会自动分配给角色。",
    invalid: "禁用后不再出现在角色权限分配树中，已有角色关联保留。",
    delete: "当前接口会将其标记为禁用，权限记录、编码和已有角色关联仍保留。",
  }[action];
  return {
    title: `${verb}权限点`,
    message: `确定${verb}权限点「${permissionText(row.permissionName)}（${permissionText(row.permissionCode)}）」？${effect}`,
    confirm: `确定${verb}`,
    success: {
      valid: "权限点已启用",
      invalid: "权限点已禁用",
      delete: "删除操作完成，权限点已标记为禁用",
    }[action],
  };
}
