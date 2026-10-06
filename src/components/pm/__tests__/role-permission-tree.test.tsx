import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RolePermissionTree } from "../role-permission-tree";
import { groupPermissions } from "../../../lib/role-permissions";
import type { PermissionResponse } from "../../../lib/api/system-types";

const groups = groupPermissions(
  [11, 12].map(
    (id) =>
      ({
        id,
        permissionName: `权限${id}`,
        permissionCode: `sys:${id}`,
        permissionType: id === 11 ? "MENU" : "CUSTOM",
        groupName: "系统",
        enabled: true,
        description: null,
        createdAt: null,
        updatedAt: null,
      }) satisfies PermissionResponse,
  ),
);
function render(selected: number[], expanded = true, disabled = false) {
  return renderToStaticMarkup(
    <RolePermissionTree
      groups={groups}
      selected={selected}
      expanded={new Set(expanded ? groups.map((group) => group.key) : [])}
      disabled={disabled}
      onSelectionChange={vi.fn()}
      onExpandedChange={vi.fn()}
    />,
  );
}
describe("权限分组树可访问渲染", () => {
  it("部分回显：父组 mixed，真实叶两态且有可访问名称", () => {
    const html = render([11]);
    expect(html).toContain('aria-label="选择分组 系统" aria-checked="mixed"');
    expect(html).toContain('aria-label="选择权限 权限11 (sys:11)" aria-checked="true"');
    expect(html).toContain('aria-label="选择权限 权限12 (sys:12)" aria-checked="false"');
    expect(html).toContain("sys:11 · MENU");
    expect(html).toContain("sys:12 · CUSTOM");
  });
  it("零选与全选父组分别 unchecked/checked", () => {
    expect(render([])).toContain('aria-label="选择分组 系统" aria-checked="false"');
    expect(render([11, 12])).toContain('aria-label="选择分组 系统" aria-checked="true"');
  });
  it("折叠只隐藏叶，父组三态与 expanded 仍可观察", () => {
    const html = render([11], false);
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("选择权限 权限11");
    expect(render([11])).toContain('aria-expanded="true"');
  });
  it("加载/在途门禁禁用组和全部真实叶控件", () => {
    const html = render([11], true, true);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
