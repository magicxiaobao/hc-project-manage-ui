import { Pencil, Plus } from "lucide-react";
import { buttonRegistry } from "../registry";

export interface RoleButtonContext {
  readonly placement: "toolbar" | "row";
  readonly row: { readonly id: number } | null;
  readonly disabled: boolean;
  readonly openCreate: () => void;
  readonly openEdit: (roleId: number) => void;
}

export const roleButtons = buttonRegistry.registerDomain<RoleButtonContext>("roles", [
  {
    code: "role:create",
    label: "新增角色",
    icon: Plus,
    visible: (context) => context.placement === "toolbar",
    handler: (context) => context.openCreate(),
  },
]);

// Adding the second action requires only this definition, with the same domain handle.
buttonRegistry.registerDomain<RoleButtonContext>("roles", [
  {
    code: "role:edit",
    label: "编辑",
    icon: Pencil,
    visible: (context) => context.placement === "row" && context.row !== null,
    handler: (context) => {
      if (context.row) context.openEdit(context.row.id);
    },
  },
]);

export const isRoleButtonDisabled = (context: Readonly<RoleButtonContext>) => context.disabled;
