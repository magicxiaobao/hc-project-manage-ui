import { createFileRoute } from "@tanstack/react-router";
import { RoleListLive } from "@/components/pm/role-list-live";

export const Route = createFileRoute("/sys/roles/")({ component: RoleListLive });
