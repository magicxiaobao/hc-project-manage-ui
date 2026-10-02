# 三项 P2 本机验收

冻结输入 `b53f3b8a4179ecf3999179f7e27c63f2cfa79e1d` 未修改。复审包最终 v1 校验大小15583 bytes、SHA256 `6828ee7e1cb51afae344b3d8f9ae046b172a4411808d4e7ce1eece79d1a651ad` 及全部文件清单；原始导航/克隆 probes 在精确 b53 worktree 本机重放均 exit0，表示反例复现，不是产品通过。

## 本轮结果

| 检查 | 结果 |
| --- | --- |
| 未修 store 的新增克隆回归 | 三种锁定状态各失败，证明保护缺口 |
| PM | 57/57；相对输入新增7个 clone 测试及1个 SELECT 身份测试 |
| app-data / auth 单元 | 55/55 |
| TypeScript | 通过 |
| 变更源码 ESLint | 7文件，0 error / 0 warning |
| 全量 ESLint | 1 error / 8 warnings，均位于本轮未改文件 |
| devbuild | VITE_AUTH_ENABLED=false，通过；保留第三方 warnings；无 db:migrate |
| auth invariant | dev/build 同为 sign-in off |
| Chromium 未修导航/焦点 | 4项反例成功复现 |
| Chromium 修复后 | 导航11项 + 克隆7项 = 18项；pageerrors为空 |
| 视觉证据 | 15截图，3张 contact sheets；冻结克隆、select焦点、无版本克隆另看全尺寸 |
| diff --check | 通过 |

导航11项包括慢返回重复Close/Escape、Close→Forward→Close、刷新详情慢返回两种关闭、旧详情在较新详情 pending 时关闭无效、关联项Back/Forward后正常Close、深链Escape回看板，以及原生状态select的Close/Escape/Back焦点恢复。select选择「已暂停」只打开原因详情，事项仍IN_PROGRESS。

克隆7项是 FROZEN/RELEASED/DEPRECATED、PLANNING/DEVELOPMENT/TESTING 和无版本来源。通过真实「克隆」按钮核对新id/key、TODO/进度0、内容、版本显示、原项/版本/发布记录、实时范围和返回初始筛选列表/触发焦点。PM测试另覆盖三种事项及非空发布快照。锁定版本克隆保持范围，可编辑版本克隆按既有合同增加一个副本。

复现使用真实安装的 TanStack 1.170.39 与缓存 Chromium。仅在响应中暴露实际 router/store 引用，设置测试 beforeLoad Promise gate 和 pendingMs=60000；未改产品导航回调或加入产品等待。以状态、事件和DOM断言，未用固定sleep判定通过。脚本、日志、截图均在 worktree 外。

## 保留事项

全量 lint 的既有 no-empty error 在 `src/lib/app-data/client.server.ts:281`；warnings 在 sprint-bucket、bits、stats-view、use-current-user、router。本轮未修改这些文件。aggregate npm test 本轮未重跑；独立复审在精确 b53 复现第一阶段195=187 pass/8缺 .grok/app-env fixture失败，后续&&阶段跳过；本轮PM/auth分别运行。不宣称全量测试或全量lint全绿。

原33张截图、52个作者浏览器检查及20个输入断言属于 b53 历史证据，本轮未覆盖或冒称全部重跑。本轮也未做物理Mac IME、Safari/Firefox、生产/全栈、读屏或所有设备/筛选组合；独立reviewer的Chromium限制仍保留。修复后候选尚待独立复审，不将本机通过等同该批准。

原UI HEAD `5264c9b10f48f4456d3b71e888c02a7c68967482`、主Vue HEAD `25f808215d2b3e94d56fb4760bb8315760f8f3d9`、A HEAD `9decb4ba03fbb03d7134a64e5f231115a0e39e73`、整合HEAD b53均保持干净。Git身份保持已有 magicxiaobao；无reset/stash/merge/push/PR，无宿主安装或安全设置修改。只停止自己的wrapper15863/监听子进程15880，4183连接拒绝61确认已释放；其他服务不动。

本地修复提交及完整源码/补丁/证据包的精确身份写在外部 receipt，避免自引用提交SHA。本轮分支 `codex/ui-main-review-fix-20261002`；先复审再后续B/C。
