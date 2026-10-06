import { createFileRoute } from "@tanstack/react-router";
import { SystemConfigListLive } from "@/components/pm/system-config-list-live";
export const Route = createFileRoute("/sys/configs/")({ component: SystemConfigListLive });
