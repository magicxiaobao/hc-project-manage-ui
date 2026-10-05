// 接入现有 pnpm test 的 node:test 脚本链路，无需修改 package.json。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("p3-trace-matrix: API、hooks、展示投影和组件回归", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/vitest/vitest.mjs"),
      "run",
      "src/lib/api/__tests__/p3-contract.test.ts",
      "src/lib/query/__tests__/trace-hooks.test.tsx",
      "src/lib/__tests__/trace-matrix.test.ts",
      "src/components/pm/__tests__/trace-matrix.test.tsx",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
});
