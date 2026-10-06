import { createFileRoute } from "@tanstack/react-router";
import { PermissionListLive } from "@/components/pm/permission-list-live";

export const Route = createFileRoute("/sys/permissions/")({ component: PermissionListLive });
