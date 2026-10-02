# UI R3 本地导入与验证

2026-10-02 UTC。在独立分支 `codex/ui-reliability-r3-20261002` 导入已独立复核的 R3 四项可靠性修复，并在本机验证。应用源码与 R3 冻结候选逐文件相同；本报告是补充记录。

## 来源与完整性

- 原仓库：`/Users/a1234/hc/hc-project-manage-ui`，HEAD `5264c9b10f48f4456d3b71e888c02a7c68967482`，初始与结束均干净。
- Worktree：`/Users/a1234/Documents/Codex/2026-10-02/task-2/ui-r3-worktree`。
- Library 原包：`libfile_03f0bb6fcb44819185e36550e56a5d53` v0，`hc-ui-reliability-r3.zip`，1,503,311 bytes。
- ZIP SHA256：`027e44f9e7886ec49776531c0e97c02acbc36b8a68497b7d02b29881d1e9535f`。
- 归档清单 486/486 项通过；无越界路径或符号链接。
- 原包 base 的 185 个文件与原仓库 HEAD Git blob 逐字节相同，无基线漂移。
- 补丁 SHA256：`e4d83a0d03335b46619bb1103fe1a2b6e4f88cf0cf81c446af34e81c2ae4bfae`，`git apply --check`、实际应用、`git diff --check` 均通过。
- 193 个候选文件全部匹配；内容树摘要（path + NUL + SHA256 + newline）：`791d83839fbb0361ecdd82bc21d61ce0bbe55f2fb4c3c3c95b24cf6f31a819b4`。本机测试/构建后再次校验相同。

## 变更行为

1. 存储读取异常、坏 JSON 和域字段基本类型错误阻断初始化，保留原文；可恢复后重试。写失败显示未保存、重试保存，SPA 壳层重挂载保留内存改动，成功反馈统一检查持久化错误。
2. `updateItem` 和 `setItemVersion` 共用版本范围检查，冻结/发布/废弃版本与跨项目版本不可绕过；失败不应用整个 patch。
3. 筛选后的取消/拒绝事项显示独立只读区域，允许打开详情，卡片不可拖放。
4. 需要原因的看板重开先要求用户填写真实原因；空输入、取消不改变状态，重复及过时确认无重复历史。

解码器通过穷尽域字段的基本类型映射覆盖可选/可空字段和嵌套集合；不引入 schema 依赖。不宣称校验枚举、跨记录关系或日期语义。

## 本机验证

Node v26.10.0 / npm 11.19.1。项目锁定依赖 `npm ci --ignore-scripts` 安装 446 包，lockfile 未改变。初次受限网络尝试与离线缓存尝试未完成；其日志保留，最终合法网络安装成功。

| 检查 | 实际结果 |
| --- | --- |
| `npm run test:pm` | 35/35 通过 |
| 既有 auth/app-data 独立命令 | 55/55 通过 |
| `npm run typecheck` | exit 0 |
| 变更 `.ts/.tsx/.mjs` 文件 ESLint | exit 0 |
| `npm run build:dev` | exit 0，保留依赖 bundler 警告，无数据库迁移 |
| `npm run lint` | exit 1，1 error / 7 warnings |
| `npm test` 第一脚本阶段 | 195 tests，187 pass / 8 fail；后续 && 阶段未执行，因此另行运行 PM/auth |
| 同锁定依赖的干净 base 全 lint/test | 相同 1 error / 7 warnings 与相同 8 个失败 |

全 lint 唯一 error 为 `src/lib/app-data/client.server.ts:281` 的 `no-empty`。八个脚本失败由源仓库未收录的 `.grok/skills`、app-env 与 AGENTS 夹具引起；本轮不伪造夹具、跳过测试或改无关代码。整体工具链仍未全绿。

## 浏览器验收

使用已安装 Python Playwright 与已缓存 Chromium，合法本机入口 `127.0.0.1:4183`。仅在启动命令使用项目已有的 `VITE_AUTH_ENABLED=false` 开发开关；未修改鉴权源码或配置。浏览器上下文使用 seed 测试数据，存储故障与状态竞争仅为该上下文的测试注入。

七条检查均 PASS，未捕获未处理 `pageerror`：

- 坏 JSON 与 numeric `planStart`：阻断、零写入、原始字节保留；替换为合法测试数据后点击重试恢复。
- `getItem` SecurityError：阻断；恢复权限模拟后重试恢复。
- `setItem` QuotaExceededError：明确未保存、磁盘原文保留；标题改动跨首页/看板 SPA 重挂载保留；重试成功后无注入的新浏览器上下文与 reload 均渲染已保存标题。
- 冻结版本详情选择器：从 v-17 移到 v-18 被拒绝，错误渲染且磁盘版本不变。
- 取消/拒绝区域：两类事项可见且不可拖，详情可打开；负责人/类型/迭代筛选组合正确。详情返回时看板重新挂载，临时筛选恢复默认，脚本按该现有行为验收。
- 原生拖放重开：记录 trusted dragstart/drop；空白禁用确认，取消/Escape 不变状态；原因输入自动聚焦，6 次 Tab 焦点留在弹窗；双击确认只追加一条带真实原因的历史。
- 弹窗打开后测试注入竞争状态更新：确认显示过时错误，保留新状态、不追加历史。

检查了 1440×1000 桌面截图，以及 390×844 取消区截图。没有将此范围内的浏览器结果扩展为全站视觉、完整可访问性、Safari 或主 Vue/真实后端验收。beforeunload 离页提示未单独进行浏览器验收。

首次浏览器脚本有定位/等待失败（隐藏的 HeroUI 原生输入、宽度为零的内部按钮、首页入口和详情导航重置筛选）；失败尝试均保留，按已渲染可见控件修正自动化后仅重跑相关检查，未修改应用源码或强制点击隐藏控件。

## 决策与证据

- 按用户授权使用独立分支/worktree，本地提交；不覆盖原工作区，不 reset/stash，不修改 Git 身份。
- 原应用源码保持 R3 冻结候选。提交额外加入本报告，作为原计划中 `docs/reports/2026-10-01-ui-reliability.md` 的验证记录。
- 保留全仓已知失败；不把 PM/auth/增量检查称为全绿。
- 本机已有合法浏览器路径，因此补充四类修复相关链路验收；原包云端浏览器 NOT_RUN 是历史记录，仍不改写。
- 不使用 8089/4179、不操作既有 Docker/MySQL、不迁移数据库、不 push/PR/merge/deploy、不安装宿主软件或更改安全设置。

本任务原件、原三轮复审/决策、原始证据保留在 `/Users/a1234/Documents/Codex/2026-10-02/task-2/r3-input/extracted/`。本次证据目录为 `/Users/a1234/Documents/Codex/2026-10-02/task-2/evidence/`：

- `import-integrity.json`、`local-verification.json`、`evidence-manifest.json`
- `pm-test.log`、`auth.log`、`typecheck.log`、`changed-lint.log`、`build-dev.log`
- `full-lint.log`、`aggregate.log`、`baseline-lint.log`、`baseline-aggregate.log`
- `browser-results.json`、`browser-acceptance.py`、所有 `browser-acceptance-attempt*.log/json`
- `browser-bad-json.png`、`browser-bad-field.png`、`browser-write-failure.png`、`browser-unsaved-spa.png`、`browser-write-retry-persisted.png`
- `browser-frozen-version.png`、`browser-cancelled-region.png`、`browser-cancelled-narrow.png`、`browser-reopen-reason.png`、`browser-reopen-success.png`、`browser-stale-reopen.png`

原包、临时原件、凭据、依赖、构建产物及浏览器自动化产物均不加入 Git。主项目 real52/fullstack 为另一任务，未在本 UI 任务中执行。
