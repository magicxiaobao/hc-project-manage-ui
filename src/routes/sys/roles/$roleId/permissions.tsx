import { createFileRoute } from "@tanstack/react-router";
import { RolePermissionsPage } from "@/components/pm/role-permissions-page";

export const Route = createFileRoute("/sys/roles/$roleId/permissions")({ component: Page });
function Page() {
  const { roleId } = Route.useParams();
  return <RolePermissionsPage roleId={roleId} />;
}
