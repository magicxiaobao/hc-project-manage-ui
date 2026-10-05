import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtures = [];
after(() => fixtures.forEach((root) => rmSync(root, { recursive: true, force: true })));

// The wrapper resolves configuration relative to its script, so copy it into
// a fixture instead of changing this application's auth flags for a test.
export function makeAppEnvWorkspace(appEnvJson) {
  const root = mkdtempSync(join(tmpdir(), "app-env-"));
  fixtures.push(root);
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(scriptDir, "with-app-env.mjs"), join(root, "scripts/with-app-env.mjs"));
  if (appEnvJson !== undefined) {
    mkdirSync(join(root, ".grok"));
    writeFileSync(join(root, ".grok/app-env.json"), appEnvJson);
  }
  return root;
}

export function runNode(args, options = {}) {
  // Sandboxed Node cannot reliably capture child output through pipes
  // (spawnSync reports EPERM). Regular files preserve the actual CLI output.
  const root = mkdtempSync(join(tmpdir(), "test-cli-"));
  const stdoutPath = join(root, "stdout");
  const stderrPath = join(root, "stderr");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  try {
    const result = spawnSync(process.execPath, args, {
      ...options,
      timeout: 10_000,
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    assert.ifError(result.error);
    return {
      status: result.status,
      signal: result.signal,
      stdout: readFileSync(stdoutPath, "utf8"),
      stderr: readFileSync(stderrPath, "utf8"),
    };
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
    rmSync(root, { recursive: true, force: true });
  }
}
