/** Browser-only frontend fixtures. Never imported by the application. */
import { StrictMode, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { PermButton } from "../perm-button";
import { RegisteredButtons } from "../registered-buttons";
import { RoleListLive } from "@/components/pm/role-list-live";
import { RolePermissionsPage } from "@/components/pm/role-permissions-page";
import { ButtonRegistry } from "@/lib/buttons/registry";
import { ButtonActions } from "@/lib/buttons/actions";
import { publishFixture } from "@/lib/buttons/__tests__/fixtures";
import { getAccessSnapshot, publishAccess, resetAccess } from "@/lib/access/store";
import { getButtonPermissionSnapshot } from "@/lib/access/button-permissions";
import { setAccessQueryClient, refreshAccess } from "@/lib/access/service";
import { getSessionGeneration, useAuthStore } from "@/lib/api/auth-store";
import "@/styles.css";

interface Context {
  id: number;
  visible: boolean;
}
interface Options {
  view: "buttons" | "roles" | "assignment";
  mode: "hidden" | "disabled";
  disabled: boolean;
  pending: boolean;
  visible: boolean;
  id: number;
}
const initial: Options = {
  view: "buttons",
  mode: "hidden",
  disabled: false,
  pending: false,
  visible: true,
  id: 1,
};
const log: unknown[] = [],
  errors: string[] = [];
const registry = new ButtonRegistry();
const domain = registry.registerDomain<Context>("browser-fixture", [
  {
    code: "fixture:create",
    label: "Registered create",
    visible: (c) => c.visible,
    handler: (c) => {
      log.push(c.id);
    },
  },
]);
const delayedDomain = registry.registerDomain<Context>("delayed-fixture", [
  {
    code: "fixture:wait",
    label: "Delayed",
    visible: (c) => c.visible,
    action: { kind: "confirm", payload: { message: "test executor only" } },
  },
]);
const unavailable = new ButtonActions();
const delayed = new ButtonActions();
const failures = new ButtonActions();
const failureDomain = registry.registerDomain<Context>("failure-fixture", [
  {
    code: "fixture:sync-failure",
    label: "Sync failure",
    handler: () => {
      throw Error("fixture synchronous failure");
    },
  },
  {
    code: "fixture:async-failure",
    label: "Async failure",
    handler: async () => {
      throw Error("fixture asynchronous failure");
    },
  },
  {
    code: "fixture:executor-failure",
    label: "Executor failure",
    action: { kind: "batch", payload: { scope: "test-only rejection" } },
  },
]);
failures.registerActionKind("batch", async () => {
  throw Error("fixture executor failure");
});
let resume: (() => void) | null = null;
delayed.registerActionKind("confirm", async ({ runAuthorized }) => {
  await new Promise<void>((resolve) => {
    resume = resolve;
  });
  return runAuthorized((context) => {
    log.push(context);
  });
});
const ref = createRef<HTMLButtonElement>();
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
setAccessQueryClient(client);
let update: (options: Partial<Options>) => void = () => {};
function Panel() {
  const [options, setOptions] = useState(initial);
  update = (changes) => flushSync(() => setOptions((current) => ({ ...current, ...changes })));
  const onError = (error: unknown) => {
    errors.push(String(error));
  };
  const context = { id: options.id, visible: options.visible };
  if (options.view !== "buttons")
    return (
      <QueryClientProvider client={client}>
        <RoleListLive />
        {options.view === "assignment" ? <RolePermissionsPage roleId="12" /> : null}
      </QueryClientProvider>
    );
  return (
    <>
      <PermButton
        code="fixture:create"
        mode={options.mode}
        fallback={<span>denied fallback</span>}
        isDisabled={options.disabled}
        isPending={options.pending}
        ref={ref}
        variant="ghost"
        size="sm"
        className="fixture-button"
        aria-label="Direct"
        onPress={() => {
          log.push("direct");
        }}
      >
        Direct
      </PermButton>
      <RegisteredButtons
        domain={domain}
        context={context}
        mode={options.mode}
        isDisabled={options.disabled}
        isPending={options.pending}
        onActionError={onError}
      />
      <div data-testid="unavailable">
        <RegisteredButtons
          domain={delayedDomain}
          context={context}
          mode={options.mode}
          actions={unavailable}
          onActionError={onError}
        />
      </div>
      <div data-testid="delayed">
        <RegisteredButtons
          domain={delayedDomain}
          context={context}
          mode={options.mode}
          actions={delayed}
          isDisabled={options.disabled}
          onActionError={onError}
        />
      </div>
      <RegisteredButtons
        domain={failureDomain}
        context={context}
        actions={failures}
        onActionError={onError}
      />
    </>
  );
}
const rootRoute = createRootRoute({ component: Panel });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
// Match the existing assignment callback's destination without importing app guards.
const assignmentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sys/roles/$roleId/permissions",
});
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, assignmentRoute]) });
const root = createRoot(document.getElementById("root")!);
flushSync(() =>
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  ),
);
Object.assign(window, {
  dynamicButtonsFixture: {
    update: (options: Partial<Options>) => update(options),
    ready: publishFixture,
    status: (status: "idle" | "loading" | "ready" | "error") =>
      publishAccess({ ...getAccessSnapshot(), status }),
    reset: () => resetAccess(null, getButtonPermissionSnapshot().sessionGeneration + 1),
    snapshot: () => {
      const s = getButtonPermissionSnapshot();
      return { ...s, grantedCodes: [...s.grantedCodes] };
    },
    log: () => log,
    errors: () => errors,
    hasRef: () => ref.current instanceof HTMLButtonElement,
    append: () => {
      registry.registerDomain<Context>("browser-fixture", [
        {
          code: "fixture:edit",
          label: "Registered edit",
          handler: (c) => {
            log.push(c.id);
          },
        },
      ]);
      update({});
    },
    resume: () => {
      resume?.();
    },
    signIn: async () => {
      const user = {
        userId: "7",
        userName: "fixture",
        cnName: null,
        roles: ["TEST"],
        authorities: ["system:admin", "role:create", "role:edit"],
        extraInfo: {},
      };
      useAuthStore.setState({ user, isAuthenticated: true, token: "frontend-fixture-only" });
      localStorage.setItem("token", "frontend-fixture-only");
      resetAccess("7", getSessionGeneration());
      await refreshAccess({ queryClient: client, force: true });
    },
    unmount: () => {
      root.unmount();
      client.clear();
      setAccessQueryClient(null);
    },
  },
});
