/**
 * P2 p2-release-lifecycle：发布表单纯函数测试（src/lib/release-form.ts）。
 *
 * 校验口径忠实于后端 ReleaseController（release/v1）+ 老前端
 * ReleaseDraft.vue / ReleaseDraftActionPanel.vue / ReleaseApprovalPanel.vue /
 * ReleaseArtifactPanel.vue：
 * - create：environmentId 必填且落在 ACTIVE 环境集合内；空白可选字段省略；
 *   idempotencyKey 每次构建生成
 * - updateDraft：整包覆盖——空白文本字段省略 key（后端写 null）、
 *   forceUpdate 按开关送、adminReason 空白省略
 * - waive/revoke：gateType 为五项之一、reason 必填
 * - approve/reject/cancel：reason 必填
 * - recordReleased：三件套必填非空白；fileSize 可选、非空须为非负整数
 *   （Java Long 口径，>Long.MAX_VALUE 拒绝）
 * - recordFailed：resultNotes 必填；附带证据时三件套必填+fileSize 可选≥0；
 *   不附带时四个证据字段全部省略（联合类型无证据分支）
 *
 * 运行：pnpm vitest run src/lib/__tests__/release-form.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  buildReleaseCreatePayload,
  buildReleaseDraftUpdatePayload,
  buildReleaseFailurePayload,
  buildReleaseSuccessPayload,
  buildReleaseWaiverPayload,
  editDraftFormFromRelease,
  emptyReleaseDraftCreateInput,
  emptyReleaseRecordResultInput,
  emptyReleaseWaiverInput,
  parseNonNegativeLong,
  validateReleaseDraftCreateInput,
  validateReleaseDraftEditInput,
  validateReleaseReasonInput,
  validateReleaseRecordResultInput,
  validateReleaseWaiverInput,
} from '../release-form';
import type {
  ReleaseDraftCreateInput,
  ReleaseRecordResultInput,
} from '../release-form';
import type { ReleaseResponse } from '../api/release-types';

const ACTIVE_ENVIRONMENTS = [11, 22, 33];

function validCreateInput(): ReleaseDraftCreateInput {
  return {
    ...emptyReleaseDraftCreateInput(),
    environmentId: '22',
    releaseNotes: '本次发布说明',
    changelog: '修复了 X',
    rollbackPlan: '回滚到上一个版本',
    forceUpdate: true,
  };
}

function validResultInput(): ReleaseRecordResultInput {
  return {
    ...emptyReleaseRecordResultInput(),
    buildNumber: 'build-42',
    artifactLocation: 'https://artifacts.example.com/app-42.zip',
    fileSize: '1048576',
    fileHash: 'deadbeef',
    resultNotes: '发布顺利',
  };
}

describe('validateReleaseDraftCreateInput', () => {
  it('环境未选时挂 environmentId 错误', () => {
    const errors = validateReleaseDraftCreateInput(
      emptyReleaseDraftCreateInput(),
      ACTIVE_ENVIRONMENTS,
    );
    expect(errors).toEqual([
      { field: 'environmentId', message: '请选择发布环境' },
    ]);
  });

  it('环境非法（非数字/负数）时报错', () => {
    expect(
      validateReleaseDraftCreateInput(
        { ...emptyReleaseDraftCreateInput(), environmentId: 'abc' },
        ACTIVE_ENVIRONMENTS,
      ).map((error) => error.field),
    ).toContain('environmentId');
    expect(
      validateReleaseDraftCreateInput(
        { ...emptyReleaseDraftCreateInput(), environmentId: '-3' },
        ACTIVE_ENVIRONMENTS,
      ).map((error) => error.field),
    ).toContain('environmentId');
  });

  it('环境不在 ACTIVE 集合内时报错（已停用）', () => {
    const errors = validateReleaseDraftCreateInput(
      { ...emptyReleaseDraftCreateInput(), environmentId: '99' },
      ACTIVE_ENVIRONMENTS,
    );
    expect(errors).toEqual([
      { field: 'environmentId', message: '所选环境不可用或已停用' },
    ]);
  });

  it('合法输入无错误', () => {
    expect(validateReleaseDraftCreateInput(validCreateInput(), ACTIVE_ENVIRONMENTS)).toEqual([]);
  });
});

describe('buildReleaseCreatePayload', () => {
  it('空白可选字段省略，idempotencyKey 每次构建不同', () => {
    const first = buildReleaseCreatePayload(validCreateInput(), 7);
    const second = buildReleaseCreatePayload(validCreateInput(), 7);
    expect(first.versionId).toBe(7);
    expect(first.environmentId).toBe(22);
    expect(first.releaseNotes).toBe('本次发布说明');
    expect(first.knownIssues).toBeUndefined();
    expect(first.compatibility).toBeUndefined();
    expect(first.dependencies).toBeUndefined();
    expect(first.forceUpdate).toBe(true);
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });
});

describe('editDraftFormFromRelease / buildReleaseDraftUpdatePayload', () => {
  const release = {
    id: 5,
    releaseNotes: '说明',
    changelog: null,
    rollbackPlan: '回滚方案',
    knownIssues: null,
    forceUpdate: true,
    compatibility: null,
    dependencies: '依赖',
  } as ReleaseResponse;

  it('null 回填为 ""', () => {
    const form = editDraftFormFromRelease(release);
    expect(form).toMatchObject({
      releaseNotes: '说明',
      changelog: '',
      rollbackPlan: '回滚方案',
      knownIssues: '',
      forceUpdate: true,
      compatibility: '',
      dependencies: '依赖',
      adminReason: '',
    });
  });

  it('整包覆盖：空白文本字段省略 key（后端写 null），forceUpdate 按开关送', () => {
    const form = editDraftFormFromRelease(release);
    const payload = buildReleaseDraftUpdatePayload(5, {
      ...form,
      releaseNotes: '  ',
      forceUpdate: false,
    });
    expect(payload.id).toBe(5);
    expect('releaseNotes' in payload).toBe(false);
    expect(payload.forceUpdate).toBe(false);
    expect(payload.rollbackPlan).toBe('回滚方案');
    expect('adminReason' in payload).toBe(false);
  });

  it('adminReason 非空时送出（trim 后）', () => {
    const payload = buildReleaseDraftUpdatePayload(5, {
      ...editDraftFormFromRelease(release),
      adminReason: ' 代发布人更新 ',
    });
    expect(payload.adminReason).toBe('代发布人更新');
  });

  it('validateReleaseDraftEditInput：adminReason 条件必填（代他人修改时）', () => {
    const form = { ...editDraftFormFromRelease(release), adminReason: '  ' };
    // 本人编辑：不校验
    expect(validateReleaseDraftEditInput(form, { requireAdminReason: false })).toEqual([]);
    // 代他人编辑：空白拒绝
    expect(validateReleaseDraftEditInput(form, { requireAdminReason: true })).toEqual([
      { field: 'adminReason', message: '代他人修改时必须填写管理员原因' },
    ]);
    // 代他人编辑：非空通过
    expect(
      validateReleaseDraftEditInput(
        { ...form, adminReason: ' 代他人更新 ' },
        { requireAdminReason: true },
      ),
    ).toEqual([]);
  });
});

describe('validateReleaseWaiverInput / buildReleaseWaiverPayload', () => {
  it('门禁类型非法与原因空白都被收集', () => {
    const errors = validateReleaseWaiverInput({ gateType: 'NOPE', reason: '  ' });
    expect(errors.map((error) => error.field)).toEqual(['gateType', 'reason']);
  });

  it('合法输入无错误且载荷 trim', () => {
    expect(validateReleaseWaiverInput({ gateType: 'NO_BLOCKING_DEFECT', reason: '无阻断' })).toEqual(
      [],
    );
    expect(buildReleaseWaiverPayload({ gateType: 'NO_BLOCKING_DEFECT', reason: ' 无阻断 ' })).toEqual({
      gateType: 'NO_BLOCKING_DEFECT',
      reason: '无阻断',
    });
  });

  it('emptyReleaseWaiverInput 默认首项门禁且原因空白', () => {
    expect(emptyReleaseWaiverInput()).toMatchObject({ reason: '' });
  });

  it('emptyReleaseWaiverInput 默认绝不落在 DIRECT_REQUIREMENT_SCOPE（后端必拒）', () => {
    expect(emptyReleaseWaiverInput().gateType).not.toBe('DIRECT_REQUIREMENT_SCOPE');
    expect(emptyReleaseWaiverInput().gateType).toBe('REQUIRED_CASES_PASSED');
  });
});

describe('validateReleaseReasonInput', () => {
  it('空白原因报错，非空通过', () => {
    expect(validateReleaseReasonInput('  ')).toEqual([
      { field: 'reason', message: '请填写原因' },
    ]);
    expect(validateReleaseReasonInput('同意发布')).toEqual([]);
  });
});

describe('validateReleaseRecordResultInput', () => {
  it('released：三件套缺一即报错，错误全部收集', () => {
    const errors = validateReleaseRecordResultInput(
      { ...emptyReleaseRecordResultInput(), includeEvidence: false },
      'released',
    );
    expect(errors.map((error) => error.field).sort()).toEqual([
      'artifactLocation',
      'buildNumber',
      'fileHash',
    ]);
  });

  it('released：resultNotes 可选；fileSize 非法时挂字段错误', () => {
    const errors = validateReleaseRecordResultInput(
      { ...validResultInput(), fileSize: '-1' },
      'released',
    );
    expect(errors).toEqual([{ field: 'fileSize', message: '文件大小必须为非负整数' }]);
  });

  it('failed：resultNotes 必填；无证据时三件套不校验', () => {
    const errors = validateReleaseRecordResultInput(
      { ...emptyReleaseRecordResultInput(), includeEvidence: false },
      'failed',
    );
    expect(errors).toEqual([{ field: 'resultNotes', message: '请填写结果说明' }]);
  });

  it('failed：附带证据时三件套必填', () => {
    const errors = validateReleaseRecordResultInput(
      {
        ...emptyReleaseRecordResultInput(),
        includeEvidence: true,
        resultNotes: '发布失败',
      },
      'failed',
    );
    expect(errors.map((error) => error.field).sort()).toEqual([
      'artifactLocation',
      'buildNumber',
      'fileHash',
    ]);
  });

  it('合法输入两种模式都无错误', () => {
    expect(
      validateReleaseRecordResultInput({ ...validResultInput(), includeEvidence: true }, 'released'),
    ).toEqual([]);
    expect(
      validateReleaseRecordResultInput({ ...validResultInput(), includeEvidence: true }, 'failed'),
    ).toEqual([]);
  });
});

describe('parseNonNegativeLong', () => {
  it('非负整数解析通过；负数/小数/超限/非数字拒绝', () => {
    expect(parseNonNegativeLong('0')).toBe(0n);
    expect(parseNonNegativeLong('1048576')).toBe(1048576n);
    expect(parseNonNegativeLong('9223372036854775807')).toBe(9223372036854775807n);
    expect(parseNonNegativeLong('-1')).toBeNull();
    expect(parseNonNegativeLong('1.5')).toBeNull();
    expect(parseNonNegativeLong('9223372036854775808')).toBeNull();
    expect(parseNonNegativeLong('abc')).toBeNull();
    expect(parseNonNegativeLong('')).toBeNull();
  });
});

describe('buildReleaseSuccessPayload / buildReleaseFailurePayload', () => {
  it('成功载荷：trim + fileSize 数字 + 空白 resultNotes 省略', () => {
    const payload = buildReleaseSuccessPayload({
      ...validResultInput(),
      resultNotes: '  ',
    });
    expect(payload).toEqual({
      buildNumber: 'build-42',
      artifactLocation: 'https://artifacts.example.com/app-42.zip',
      fileSize: 1048576,
      fileHash: 'deadbeef',
      resultNotes: undefined,
    });
  });

  it('失败无证据载荷：四个证据字段一律省略（联合无证据分支）', () => {
    const payload = buildReleaseFailurePayload({
      ...emptyReleaseRecordResultInput(),
      resultNotes: '回滚了',
      includeEvidence: false,
    });
    expect(payload).toEqual({ resultNotes: '回滚了' });
    expect('buildNumber' in payload).toBe(false);
    expect('fileSize' in payload).toBe(false);
  });

  it('失败有证据载荷：三件套齐全', () => {
    const payload = buildReleaseFailurePayload({
      ...validResultInput(),
      includeEvidence: true,
    });
    expect(payload).toEqual({
      resultNotes: '发布顺利',
      buildNumber: 'build-42',
      artifactLocation: 'https://artifacts.example.com/app-42.zip',
      fileSize: 1048576,
      fileHash: 'deadbeef',
    });
  });
});
