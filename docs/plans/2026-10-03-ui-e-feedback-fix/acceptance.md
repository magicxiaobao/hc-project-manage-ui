# E 日期反馈最小增量验收

父候选 `5ea5d02ce59d4061897acb345b7e3519c8a5b4ce` 保持冻结、干净。新独立 worktree/分支 `ui-e-feedback-fix` / `codex/ui-e-feedback-fix-20261003` 仅修改 `gantt-view.tsx` 和本目录两份文档；精确新 commit/parent/tree 在交付包 manifest 中，避免自引用提交哈希。新提交没有获得独立 noMajor；5ea 的正式 scoped noMajor 只属于原候选。

## 真实反例与最小决定

原 5ea 真实 Chromium：经 UI 将 HC-141 设为 2026-10-02 至 10-06，既有依赖将 HC-142/150 顺延。随后 HC-142 请求 10-05 至 10-15；原 alignPlans 完全调回当前 10-06 至 10-16。完整序列化 store 数据相等，表单关闭、0 toast，`red.json` / `red-no-op-silent.png` 保留。

仅在输入日期发生变化、现有 `commitPlan` 返回 false 时显示“这次日期调整违反依赖，计划没有改。”。原值保存不误报。仍调用原 commitPlan，保留其原值请求可能触发既有依赖对齐的语义；不修改 alignPlans、updates、拖拽、store、权限、状态、审批、冻结、持久化或主 Vue。表单仍关闭并同步回到原日期按钮。

原 setItemPlans 没有 cancelled/冻结版本/角色的全面排期禁写保护；原冻结保护针对 version scope。此次未增加或声称验收了全面排期冻结，不把现有拖拽同合同解释为新旁路。生产合同/Vue 迁移另行处理。

## 新鲜验证

环境 Node v26.10.0、Python 3.14.7、Playwright 1.63.0 / Chromium 145.0.7632.6；既有 node_modules 链接，未安装依赖。服务仅使用先确认空闲的 4183，以仓库 `VITE_AUTH_ENABLED=false npm run dev -- --port 4183 --strictPort` 启动，未使用 8089/4179 或改其他服务。

| 实际命令 | 退出/结果 |
| --- | --- |
| `python3 ../ui-e-feedback-evidence/red.py`，未改 5ea | 0，数据相等/静默关闭反例成立 |
| `python3 ../ui-e-feedback-evidence/verify.py`，最终 delta | 0，10 组预期断言、pageerrors=[]；JSON 和截图须结合读取 |
| `npm run test:pm` | 0，57/57 |
| `node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts` | 0，55/55 |
| `npm run typecheck` | 0 |
| `./node_modules/.bin/eslint src/components/pm/gantt-view.tsx` | 0，无输出 |
| `VITE_AUTH_ENABLED=false npm run build:dev`，普通沙箱 | 1，既有链接 node_modules/.vite-temp 写入 EPERM，原日志保留 |
| 同一 `build:dev`，已授权本地构建权限 | 0，开发构建通过；既有 module directive 等构建 warning 保留，无迁移 |
| `VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183` | 0，dev/build sign-in off 一致 |
| `git diff --check` | 0 |

浏览器 10 组：四宽度 320×568 / 390×844 / 768×900 / 1440×900 的 changed-but-constrained no-op；原值保存；Cancel；Escape；旧 pointer no-op；合法正常日期保存；HC-141→142→150 真实顺延。日期入口用真实 Tab/Enter，无程序 focus 代替；日期 fill、保存/取消点击、Escape 和 pointer mouse 均为真实控件动作。业务快照仅用于读断言，fixture 通过 UI 建立。

四宽度均核 no-op 全数据相等、表单关闭、来源按钮焦点、通知文字/opacity/完整视口矩形、页级无横溢出。最终关键 PNG 在通知进入动画稳定后拍摄并实际查看；不将 DOM visible 当完整视口可见。正常改动 HC-144=10-08..10-10；顺延 HC-141=10-03..10-07、142=10-07..10-17、150=10-18..10-22。Cancel/Escape/原值保存没有数据变动或虚假警告。

## 保留的失败与限制

- 首次指针入口脚本在窄屏 HC-142 中央点击被相邻事项按钮遮挡；该布局在 5ea 与本增量源码相同，本次没有实际启动 5ea 浏览器作此项双版本对照。改用真实 Tab/Enter 可达后完成反馈验收，未 force click 或绕过遮挡，原失败日志保留；该窄屏布局仍未解决。
- Cancel 文案初始定位错误；第一次失败日志保留，第二次运行发现仍不匹配实际“取消计划编辑”后主动中断 130，最终按实际文字重跑。没有将 harness 失败当产品失败或绿结果。首次绿组截图处于 toast 进入动画，随后补充整条视口断言并重拍；前次绿 JSON/log 单独保留。
- 全仓 lint 的旧 1 error/8 warnings（client.server.ts:281 no-empty）及 aggregate 第一段 187/195、8 个缺 `.grok/app-env` 等 fixture 失败继续保留；本次不重跑未变全仓控制、不声称整仓绿。E 原精确独立复审的新鲜失败日志可官方回读取用。
- E 原 13+3 组与独立日期15/焦点树56/Dfresh16 控制作为历史证据，本次只重跑差异；不声称新版全矩阵或新版独立 noMajor。Safari/实体触屏/IME/辅助技术/生产 auth、瞬时通知存续期间所有快速键盘时序仍未覆盖。
- F01–F17 覆盖见 `coverage.md`：不将批次完成等同原审计所有建议闭环；尤其 F07 导航分组、F14 首页/统计层级仍部分/待设计。

只做本地修改、验证和本地提交。无 push/PR/merge/deploy/远端删除/force，主 Vue 或 planned 能力未启动。可恢复交付包保存完整当前源与 Git bundle、精确父 patch、manifest、少量关键新/历史证据、原834行审计与正式独立报告正文/引用；通过官方 Library 保存并官方 helper 回读核 SHA，receipt 另存。
