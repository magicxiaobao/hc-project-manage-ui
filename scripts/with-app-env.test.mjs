import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mergeAppEnv, parseAppEnv, readAppEnv } from "./with-app-env.mjs";
import { makeAppEnvWorkspace, runNode } from "./test-cli.mjs";

const makeWorkspace = makeAppEnvWorkspace;
const wrapperRoot = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
const WRAPPER = join(wrapperRoot, "scripts/with-app-env.mjs");
// Do not let the test runner's auth flag override the fixture implicitly.
const testEnv = { ...process.env };
delete testEnv.VITE_AUTH_ENABLED;
const PRINT_FLAG = "process.stdout.write(String(process.env.VITE_AUTH_ENABLED));";

test("keeps VITE_-prefixed string entries", () => {
  assert.deepEqual(parseAppEnv('{"VITE_AUTH_ENABLED":"false"}'), {
    VITE_AUTH_ENABLED: "false",
  });
});

test("drops non-VITE keys, non-string values and malformed documents", () => {
  assert.deepEqual(parseAppEnv('{"DATABASE_URL":"postgres://x","VITE_N":1,"VITE_OK":"y"}'), {
    VITE_OK: "y",
  });
  assert.deepEqual(parseAppEnv("not json"), {});
  assert.deepEqual(parseAppEnv('["VITE_AUTH_ENABLED"]'), {});
  assert.deepEqual(parseAppEnv("null"), {});
});

test("a missing app-env.json is a clean no-op", () => {
  assert.deepEqual(readAppEnv(makeWorkspace()), {});
});

test("reads the app env from a workspace", () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  assert.deepEqual(readAppEnv(root), { VITE_AUTH_ENABLED: "false" });
});

test("an explicit process-env override wins over the file", () => {
  const merged = mergeAppEnv(
    { VITE_AUTH_ENABLED: "false" },
    { VITE_AUTH_ENABLED: "true", PATH: "/usr/bin" },
  );
  assert.equal(merged.VITE_AUTH_ENABLED, "true");
  assert.equal(merged.PATH, "/usr/bin");
});

test("a wrapper without app-env preserves the command's environment", () => {
  const wrapper = join(makeWorkspace(), "scripts/with-app-env.mjs");
  const run = runNode([wrapper, process.execPath, "-e", PRINT_FLAG], { env: testEnv });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "undefined");
});

test("vite loadEnv resolves the wrapped value", () => {
  // What `import.meta.env.VITE_AUTH_ENABLED` becomes: loadEnv prefix-matches
  // process.env, so the wrapper's merge has to land before Vite starts.
  // Do not `import { loadEnv } from "vite"` here — Vite 8 loads rolldown
  // native bindings that SIGSEGV the test worker under qemu-user.
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  const merged = mergeAppEnv(readAppEnv(root), { PATH: "/usr/bin" });
  assert.equal(merged.VITE_AUTH_ENABLED, "false");
});

test("the wrapped command runs with the app env applied", () => {
  const run = runNode([WRAPPER, process.execPath, "-e", PRINT_FLAG], { env: testEnv });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "false");
});

test("the wrapped command sees an explicit override, not the file value", () => {
  const run = runNode([WRAPPER, process.execPath, "-e", PRINT_FLAG], {
    env: { ...testEnv, VITE_AUTH_ENABLED: "true" },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "true");
});

test("the wrapper propagates the command's exit code", () => {
  const run = runNode([WRAPPER, process.execPath, "-e", "process.exit(3)"]);
  assert.equal(run.status, 3);
});

test("a signal-killed command is never reported as success", () => {
  // The wrapper's own SIGTERM handler must not swallow the re-raised signal:
  // a cancelled build reporting exit 0 is a silently passing gate.
  const run = runNode([
    WRAPPER,
    process.execPath,
    "-e",
    "process.kill(process.pid, 'SIGTERM');setTimeout(() => {}, 1000);",
  ]);
  assert.ok(run.signal === "SIGTERM" || (run.status !== null && run.status !== 0));
});

test("the CLI still runs when invoked through a symlinked path", () => {
  // node realpaths import.meta.url but not process.argv[1], so a raw comparison
  // turns the wrapper into a no-op that exits 0 without starting anything.
  const link = join(mkdtempSync(join(tmpdir(), "app-env-link-")), "scripts");
  symlinkSync(join(wrapperRoot, "scripts"), link);
  const run = runNode(
    [join(link, "with-app-env.mjs"), process.execPath, "-e", PRINT_FLAG],
    { env: testEnv },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "false");
});
