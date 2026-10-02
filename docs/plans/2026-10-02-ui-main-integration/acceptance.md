# 冻结 main + A 整合验收

main 输入 `097ed24afec27e8cfc0caf0d7c45a12354fa0cd9`，A 输入 `9decb4ba03fbb03d7134a64e5f231115a0e39e73`。本轮仅整合 A；旧分支与 `818bdd`/`9decb` 保留。精确最终提交、父提交、源码逐文件校验与证据位置以外部 `integration-receipt.json` 为准。

## 已保留与恢复

保留 main 紧凑可排序清单、负责人/状态/点数行内编辑、看板排名与父编号/点数、WIP 超限仅提示、前后事项和克隆、新字段及 decoder、通知未读/类型记忆。main 的 store/domain/decoder 没有被 A 覆盖。

恢复 A Modal 焦点与键盘、来源 history/筛选/排序/触发器/滚动、即时 query 与异步 URL 同步 guard；取消/拒绝事项有只读展示区。跨列重开要填真实原因，取消/空原因不改状态或排名，确认时检查原状态和排序目标，成功后才排序，双击不重复历史。

真实组合验收发现并解决：清单卸载时全局浏览顺序被默认排序更新（改用首次来源顺序快照）；克隆按钮被 Modal 关闭按钮遮挡（保留关闭位置并为标题留白/换行）；移动端新筛选条造成横向 scroller 误选（看板专用标识）。保留原 A 的 patch 拒绝反馈，冻结版本修改拒绝可见。

## 本机验证

| 验证 | 结果 |
|---|---|
| PM Node | 49/49；含 main 的 3 个 schedule 测试及来源顺序快照校验 |
| app-data/auth 四组 Node | 55/55 |
| TypeScript | 通过 |
| 20 个变更源文件 ESLint | 0 error / 0 warning |
| 全仓 ESLint | 1 error / 8 warnings；错误为未修改的 `client.server.ts:281` 空 block，警告路径同样不在本轮修改范围 |
| `VITE_AUTH_ENABLED=false npm run build:dev` | 通过；第三方模块指令警告保留 |
| auth invariant | dev/build 一致，隔离验收 sign-in off |
| 主浏览器回归 | 27 项通过：焦点圈、Escape/关闭/背景、原生 Back/Forward/刷新、父子/搜索、个人/通知、未保存/retry、390px |
| 额外浏览器回归 | 7 项通过：类型/迭代/全部筛选、依赖来源、子事项、嵌套选择器 Escape、真实清单滚动 |
| main+A 浏览器组合 | 15 项通过：排序与前后/clone/刷新、较新搜索优先、行内点数/负责人、四列各有溢出的 Escape/关闭/Back、WIP、列内排序/跨列、原因取消/双击/状态竞态、取消区、负责人/标签筛选、通知来源目标消失时标题焦点 |
| R3 浏览器边界 | 2 项通过：注入 getItem 异常时阻断且重试保留原文；冻结版本详情修改被拒绝并展示反馈 |
| 移动端横向反例闭环 | 390px，真实鼠标横滚，Escape：修前 894→0；修后 894→894，原完成列卡片焦点恢复 |
| query/光标/URL/composition | 20 项断言通过，包含逐键/快慢输入、中间增删、Chromium CDP composition/提交/续输入 |

浏览器检查使用已有 Python Playwright 和缓存 Chromium。截图、ARIA、原始 JSON、脚本与命令日志均在 worktree 外的 `ui-main-integration-evidence`，复审包提供源码、相对冻结 main 的 patch 和逐文件 SHA256。原有 A 包未替换。

## 限定与剩余项

真实浏览器验证是 auth off、隔离示例数据；状态竞态/读写异常通过临时 browser context 注入，未修改宿主安全设置。CDP composition 不等于 macOS 物理输入法人工验收。四列各有溢出的垂直恢复实测三种关闭方式；移动端横向实测为 Escape，不声称穷尽所有列/筛选/设备组合。未验证 Safari/Firefox、辅助技术或生产接口鉴权。

没有运行含数据库迁移的 production build，没有运行整个 aggregate 测试命令；旧基线曾有 8 个缺失 `.grok` fixture 失败，本轮不把该历史结果冒充新 main 结果。完整 lint 未全绿，范围外问题未夹带修复。B/C、推送、PR、主 Vue、Docker/MySQL 均未操作。独立复审待进行。

结束时只读核对 origin/main 仍为冻结 `097ed24`，远端 R3 分支仍为 `3745ae8`。
