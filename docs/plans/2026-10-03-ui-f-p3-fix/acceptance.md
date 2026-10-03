# F 两项 P3 验收记录

父候选 `cbd58da4eb020d5a187c1736a0341c3ae5088ef2` 已获精确 scoped noMajor（无 P0/P1/P2）；本修订需自己的精确独立复审，不能继承父结论。父报告由 Library 官方 prepare_materialize 与当前 library_file_transfer.py 取回；外层 207659 bytes、SHA256 `922018fb28725a362c717a8db5322b3d3393a2c64e6ca32a67eaf328a2c25e89`、32 载荷均核验。身份 `libfile_56377dec6384819186e262ad0320050c` v0。原 F 完整作者包也复用已官方物化文件核验外层：`libfile_9bf6e5e12ff88191a06c81adb2887b0d` v0，9835827 bytes，SHA256 `24c084a0d1b7837df4d30ad34ef27cda943aef0b59042e295077ccf1ab903c9d`。

仅三个 view 改动。设置与用例 Save 原动作返回 ok 后，从原 store 取回实际接受的名称/简介或前置/步骤/套件，令显示与原 trim 结果一致。原持久化错误优先级、重试、尚未加一步的输入和真实新草稿保留。统计原五链接使用已有类实现至少 44×44 目标和键盘 outline；路由、search、文字不变，320 时自然换行。没有新增业务动作，没有改变 store、domain、persistence、schedule、navigation、Gantt、全局 CSS、包或锁文件；对应字节 SHA 在 contracts-preserved.json。

证据位于交付包 evidence/，具体脚本与日志可复执行；没有将父或旧 D/E 通过当作本次重跑。

| 实际命令 | 退出码 | 结果/日志 |
| --- | --- | --- |
| `npm run test:pm`（改前、改后各一次） | 0 / 0 | 57/57；pm-before.log、pm.log |
| `npm run typecheck`（改前、改后各一次） | 0 / 0 | type-before.log、type.log |
| `node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts` | 0 | 55/55；最终源码再执行，auth-app-data.log |
| `npx eslint src/components/pm/settings-view.tsx src/components/pm/tests-view.tsx src/components/pm/stats-view.tsx` | 0 | 0 errors、1 原 Stats Fast Refresh warning；changed-lint.log |
| `VITE_AUTH_ENABLED=false npm run build:dev` | 0 | build-dev.log；未运行含 db:migrate 的普通 build |
| `VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183` | 0 | dev/build sign-in off 一致；auth-invariant.log |
| `python3 ../ui-f-p3-evidence/verify-p3.py red` | 0 | 改前 3 组真实反例；red.json、3 图。退出 0 表示反例按预期复现，不能当成通过 |
| `python3 ../ui-f-p3-evidence/verify-p3.py green` | 0 | 改后 10 组、page_errors=[]；green.json、20 图 |
| `python3 ../ui-f-p3-evidence/focus-observe.py` | 0 | 原生 Tab 的 active/focus-visible、2px solid；独立观察图 1 张 |
| `python3 ../ui-f-p3-evidence/contrast-p3.py` | 0 | 原五链接四宽普通/hover 共 40 样本，最小 5.777775；contrast.json |
| `git diff --check` | 0 | 最小补丁无空白错误 |

浏览器为作者本机 Python Playwright 1.58.0、Chromium 145.0.7632.6；设置/用例均在 320×568、390×844、1440×900 完整验证空白规范化、重复 Save、Quota 写入失败时磁盘旧值/内存新值、beforeunload、原重试、重试后未提交草稿仍在、真实后续编辑和空白名称拒绝。用例额外验证已加入步骤规范化，未加一步 action/expected 不被清掉或误报落盘，关闭/重开读到规范值。失败时依旧显示无法保存；恢复写入后重试只保存已接受内存对象，不吞新表单草稿。

统计 320×568、390×844、768×900、1440×900：20 次正常 locator pointer 点击进入原目的页并 Back；所有目标实测高度 44、宽度至少 80（最小整组），无页面横向溢出。在正常新加载统计页上用原生 Tab 到链接、Enter 导航 hideDone=true、Back；四宽均 focus-visible=true、solid 2px。关键图已人工查看设置 320、用例 390、统计 320，另有四宽目标/焦点截图。颜色按浏览器实际 sRGB 前景与祖先背景合成，结论仅覆盖五链接普通/hover，不能泛化全站 WCAG。

保留三份早期探针失败日志：pointer 导航后的焦点状态断言、Python 引号语法错误、历史恢复后读 outline 时机。修正了测试为新加载页面正常键盘入口及样式等待，没有强制 focus 或为探针改业务源码；最终 green、独立 focus 观察通过。这些早期执行不计通过。

父报告保留全仓 lint 的 1 error/8 warnings 与 aggregate 187/195 中 8 个缺 fixture 失败、后续 && 阶段未运行；本次不重跑、不顺带修复，独立报告及其原日志随包保存，明确为父历史结果。没有重跑完整 F/D/E 全链；未改模块依据精确父与相同源码，不冒认新验收。Safari、真实触摸设备、IME、辅助技术和生产鉴权未测试；局部加载/权限/错误恢复、通用草稿保护、主 Vue/planned 等既有边界不扩大。

没有从零创建用例或直接 DRAFT→ACTIVE 的 UI。原 updateCase 本来支持 status，归档恢复也本来可变 ACTIVE；不把“缺 UI”误写成“无 action”。原 setItemPlans 不提供完整取消/冻结排程守卫，本次没有增加，也不宣称完整冻结保护。

最终精确 commit/parent/tree、clean、4183 关闭、离线 bundle 和父补丁复原、包 SHA 与 Library 版本以交付 manifest/README/回读 receipt 为准。只做本地，未 push、PR、merge、部署、远端修复。
