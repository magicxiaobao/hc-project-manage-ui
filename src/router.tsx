import { createRouter } from "@tanstack/react-router";
import { ContentSkeleton } from "@/components/biz/skeleton";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

function PendingPage() {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  return <ContentSkeleton pathname={pathname} />;
}

import { createQueryClient } from '@/lib/query/client';
export function getRouter() {
  const queryClient = createQueryClient();
  return createRouter({
    context: { queryClient },
    defaultPreloadStaleTime: 0,
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultPendingComponent: PendingPage,
    defaultPendingMs: 120,
    defaultPendingMinMs: 180,
  });
}
