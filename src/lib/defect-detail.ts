/**
 * 缺陷编辑表单载荷组装（P2：p2-defect-detail-flow）。
 *
 * 纯函数，可独立测试。契约忠实于后端 DefectUpdateRequest 与
 * DefectRepository.updateEditableFields 的 null-skip 语义
 *（`<if test="changes.xxx != null">`）：
 * - 标题必填（调用方先做非空/长度校验），trim 后发送
 * - 空文本 → null：null = 保留原值、不清空；后端目前不支持通过编辑清空字段
 * - reporterId：空白 → null（保留原值）；非法输入由调用方先拦截
 * - attachments 刻意省略：P2 明确排除附件操作，写回已读旧值会覆盖并发附件变更
 */
import type { DefectResponse, DefectUpdatePayload } from './api/defect-types';
import { parseOptionalPositiveInt } from './task-create';

/** 缺陷编辑表单原始输入（均为受控组件的字符串值） */
export interface DefectEditFormInput {
  title: string;
  description: string;
  defectType: string;
  priority: string;
  reporterId: string;
  foundDate: string;
  estimatedFixDate: string;
  reproductionSteps: string;
  expectedResult: string;
  actualResult: string;
  environment: string;
  tags: string;
}

/** 由 DefectResponse 回填编辑表单（attachments 不回填：编辑不碰该字段） */
export function editFormFromDefect(detail: DefectResponse): DefectEditFormInput {
  return {
    title: detail.title ?? '',
    description: detail.description ?? '',
    defectType: detail.defectType ?? '',
    priority: detail.priority ?? '',
    reporterId: detail.reporterId != null ? String(detail.reporterId) : '',
    foundDate: detail.foundDate ?? '',
    estimatedFixDate: detail.estimatedFixDate ?? '',
    reproductionSteps: detail.reproductionSteps ?? '',
    expectedResult: detail.expectedResult ?? '',
    actualResult: detail.actualResult ?? '',
    environment: detail.environment ?? '',
    tags: detail.tags ?? '',
  };
}

/** 由编辑表单组装 POST /defect/v1/updateDefect 载荷 */
export function buildDefectUpdatePayload(
  defectId: number,
  form: DefectEditFormInput,
): DefectUpdatePayload {
  const noneEmpty = (value: string) => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };
  return {
    id: defectId,
    title: form.title.trim(),
    description: noneEmpty(form.description),
    defectType: noneEmpty(form.defectType),
    priority: (form.priority || undefined) as DefectResponse['priority'] | undefined,
    reporterId: parseOptionalPositiveInt(form.reporterId),
    foundDate: noneEmpty(form.foundDate),
    estimatedFixDate: noneEmpty(form.estimatedFixDate),
    reproductionSteps: noneEmpty(form.reproductionSteps),
    expectedResult: noneEmpty(form.expectedResult),
    actualResult: noneEmpty(form.actualResult),
    environment: noneEmpty(form.environment),
    tags: noneEmpty(form.tags),
  };
}
