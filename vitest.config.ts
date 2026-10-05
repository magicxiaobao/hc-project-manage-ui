import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 最小 vitest 配置：仅补齐 `@/` 路径别名（与 tsconfig paths 一致），
 * 供挂载组件的交互测试解析 `@/components/...` 等导入。
 * 其余保持 vitest 默认（node 环境；需要 DOM 的测试文件用
 * `// @vitest-environment jsdom` 注释单独声明）。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
