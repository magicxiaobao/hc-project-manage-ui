import { useLayoutEffect, useRef } from "react";
import {
  groupCheckState,
  togglePermission,
  togglePermissionGroup,
} from "../../lib/role-permissions";
import type { CheckState, PermissionGroup } from "../../lib/role-permissions";

function PermissionCheckbox({
  label,
  state,
  disabled,
  onChange,
}: {
  label: string;
  state: CheckState;
  disabled: boolean;
  onChange: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (input.current) input.current.indeterminate = state === "mixed";
  }, [state]);
  return (
    <input
      ref={input}
      type="checkbox"
      aria-label={label}
      aria-checked={state === "mixed" ? "mixed" : state === "checked"}
      checked={state === "checked"}
      disabled={disabled}
      onChange={onChange}
      className="size-4 shrink-0 accent-primary"
    />
  );
}

export function RolePermissionTree({
  groups,
  selected,
  expanded,
  disabled,
  onSelectionChange,
  onExpandedChange,
}: {
  groups: PermissionGroup[];
  selected: number[];
  expanded: Set<string>;
  disabled: boolean;
  onSelectionChange: (ids: number[]) => void;
  onExpandedChange: (keys: Set<string>) => void;
}) {
  return (
    <div aria-label="权限分组" className="space-y-3">
      {groups.map((group) => (
        <section key={group.key} className="rounded-sm border border-border">
          <div className="flex items-center gap-3 bg-surface p-3">
            <PermissionCheckbox
              label={`选择分组 ${group.name}`}
              state={groupCheckState(group, selected)}
              disabled={disabled}
              onChange={() => onSelectionChange(togglePermissionGroup(selected, group))}
            />
            <button
              type="button"
              aria-label={`${expanded.has(group.key) ? "收起" : "展开"}分组 ${group.name}`}
              aria-expanded={expanded.has(group.key)}
              className="flex flex-1 items-center justify-between text-left"
              onClick={() => {
                const keys = new Set(expanded);
                if (keys.has(group.key)) keys.delete(group.key);
                else keys.add(group.key);
                onExpandedChange(keys);
              }}
            >
              <span>
                {group.name}（{group.children.length}）
              </span>
              <span aria-hidden="true">{expanded.has(group.key) ? "−" : "+"}</span>
            </button>
          </div>
          {expanded.has(group.key) && (
            <ul className="divide-y divide-border">
              {group.children.map((permission) => (
                <li key={`perm:${permission.id}`} className="flex items-center gap-3 p-3 pl-6">
                  <PermissionCheckbox
                    label={`选择权限 ${permission.permissionName ?? permission.id} (${permission.permissionCode ?? "—"})`}
                    state={selected.includes(permission.id) ? "checked" : "unchecked"}
                    disabled={disabled}
                    onChange={() => onSelectionChange(togglePermission(selected, permission.id))}
                  />
                  <div className="min-w-0 flex-1">
                    <p>{permission.permissionName ?? "—"}</p>
                    <p className="break-all text-xs text-default-500">
                      {permission.permissionCode ?? "—"} · {permission.permissionType ?? "—"}
                    </p>
                    {permission.description && (
                      <p className="text-xs text-default-500">{permission.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
