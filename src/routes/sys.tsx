import { createFileRoute, Outlet } from "@tanstack/react-router";
import { guardAccess, isRegisteredTarget } from "@/lib/access/guard";
export const Route = createFileRoute("/sys")({
  beforeLoad: ({ location, context, matches }) =>
    guardAccess({
      location,
      queryClient: context.queryClient,
      registeredPage: isRegisteredTarget(matches, location.pathname),
    }),
  component: Outlet,
});
