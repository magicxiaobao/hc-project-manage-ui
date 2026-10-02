# UI 批次 A 验收

批次 A 已完成弹窗键盘和来源导航改进。范围为 18 个源码文件（含新增 8 个导航规则测试）与本目录文档；基线是已推送的 R3 `3745ae833a1d4df955e306e4d074e44923c411e0`。分支仍为 `codex/ui-reliability-r3-20261002`，独立 worktree 为 `/Users/a1234/Documents/Codex/2026-10-02/task-2/ui-r3-worktree`。本批不推送、不创建 PR；本地提交与远端 R3 分开记录在审查包 receipt 中。

## 最终行为

- 详情与搜索复用既有 HeroUI / React Aria Modal，焦点留在活动弹窗内；Escape 和关闭恢复原触发控件。创建的取消、关闭、Escape 同样可用。选择器弹层先消费 Escape，第二次 Escape 才关闭创建弹窗；全局 C 快捷键不会跨活动弹窗触发。
- 列表的 query / kind / mine / hideDone、看板的 board / sprint / kind / mine / cancelled 保存到 URL，使用 replace 更新筛选，避免输入每个字符都增加历史条目。筛选业务谓词及 R3 状态流转规则保持原语义。
- 详情历史保存经过校验的同应用来源、触发控件和滚动位置；关闭返回原历史条目，相关父子事项、依赖与搜索结果保留来源。直接打开详情且无来源时回本项目看板，并聚焦页面标题。
- 重复关闭与过期回调有历史条目检查；较新导航取消旧焦点恢复。真实验收发现刷新详情后来源路由仍在加载，已改为等待路由完成后恢复焦点。鼠标双击的第二次点击可能落在新遮罩上，已过滤重复遮罩点击，普通遮罩点击仍关闭。
- `/me` 和 `/inbox` 纳入 AppShell，直接进入时也初始化数据和持久化，并有明确的“返回工作台”入口；收件箱打开事项后能回到原通知控件。

## 实际检查

| 检查 | 本机结果 |
| --- | --- |
| `npm run test:pm` | 43 / 43 通过，含 R3 35 项及新增导航 8 项 |
| app-data / auth 四组 Node 测试 | 55 / 55 通过 |
| `npm run typecheck` | 通过 |
| 实际变更 18 个 ts / tsx 文件 ESLint | 0 error / 0 warning |
| `VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183` | dev / build 一致，sign-in off；只用于隔离本地验收 |
| `VITE_AUTH_ENABLED=false npm run build:dev` | 通过；没有执行带 DB 迁移的生产 build |
| `npm run lint` | 失败：原有 1 error / 7 warnings；错误在 `src/lib/app-data/client.server.ts:281` 的空块，未改动此文件 |
| `npm test` | 首段 195 项：187 通过、8 失败；缺少 `.grok/skills/og`、`.grok/skills/app-env` 等文件，后续两段因 `&&` 未执行；相关 55 项和 PM 43 项另行执行并通过 |

全 lint 与聚合首段的已知失败在 R3 干净基线曾复现；本批重新运行结果相同，不能宣称全仓库全绿。开发构建仍有第三方指令/分块警告。浏览器无 pageerror，但开发服务有既有 Modal/PressResponder 警告，不宣称无控制台 warning。

## 真实浏览器证据

使用本机既有 Python Playwright 与 Chromium，无新增软件、无安全设置修改。独立 4183 服务先确认空闲，未使用 8089 / 4179，未动 Docker / MySQL。最终完整 `run-13` 27 个检查通过，补充 `run-11` 7 个检查通过，总计 34 个实际断言；16 张最终截图逐张打开检查。

完整链覆盖详情、搜索结果/空结果、创建的 Tab / Shift+Tab 循环、Escape / Close / Cancel、原焦点、带筛选来源、原生 Back / Forward、刷新、父子与依赖连续打开、重复双击与 Escape、较新搜索弹窗、个人与收件箱深链/返回，以及 390px 详情。补充链覆盖四个列表筛选、看板类型/选择、迭代、普通遮罩关闭、选择器 Escape 分层、真实鼠标滚动后的来源位置恢复。

R3 回归使用隔离浏览器上下文：坏 JSON 重试仍保留原始字节；模拟 QuotaExceededError 时保留标题、故事点与未发送评论，切换讨论标签草稿仍在；关闭详情能看到未保存提示，恢复写权限后重试保存并核实持久内容。未改 domain / store / storage 或生产接口、权限、状态机。

验收过程中保留了失败记录：一次脚本参数错误、控件定位/等待错误，以及刷新焦点和双击遮罩两处实际产品问题。最终通过记录明确指向最后成功运行，没有把失败日志覆盖或把纯测试当浏览器验收。一次 exec transport 断开后用实际 `pwd` / 日志 / 进程查询确认恢复，后续工具与验收成功；目前无执行阻断。

## 剩余范围

批次 B / C 及审计其他项尚未实施。详情覆盖期间未保存提示仍位于 AppShell 背景，这是原审计的后续范围；本批保留提示与重试语义，未扩展存储产品设计。本次为隔离示例数据、auth off 的 Chromium 验收，不代表生产接口、鉴权、主 Vue、Safari / Firefox、辅助技术或全栈验收。原 UI main `5264c9b`、主 Vue `25f8082` 均保持 clean。

小审查包包含本批 patch、当前 18 个源码文件、计划/本报告、实际日志、两个成功浏览器运行及其截图和脚本、按文件 SHA256 的 manifest 与交付 receipt。不含历史 R3 原包、旧全量审计、凭据、node_modules 或构建产物。失败调试记录保留在本机证据目录供追溯。
