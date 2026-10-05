import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest 使用的 Vite 版本不识别应用的 tsconfigPaths 选项，显式复用 @ 别名。
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
