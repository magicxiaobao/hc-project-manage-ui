import { createFileRoute } from "@tanstack/react-router";
import { MenuListLive } from "@/components/pm/menu-list-live";

export const Route = createFileRoute("/sys/menus/")({ component: MenuListLive });
