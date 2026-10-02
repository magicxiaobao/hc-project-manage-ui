# E 新日期入口 P2 作者验收

父 `46ed121f7244947e16c8916105a44cf6461dc92b` 保持干净冻结。新commit/parent/tree与dirty在交付manifest；本提交只含一个UI文件、覆盖矩阵更正、本目录两份文档。F准备文件在候选worktree外，无F源码；新候选待精确独立复审，不能沿用父/祖先的noMajor。

## 真实红绿与几何

原46ed在320×568和390×844分别实测row64px、title44px、date44px，日期底部超row底24px，中心命中相邻HC88事项按钮（未改seed中的真实相邻顺序是HC93/HC142/HC88）。正常locator.click等待被拦截，未forceClick；`red.json`、两个normal-click-blocked.log和原截图保留。初始直接mouse点击的脚本误猜邻项为HC150，实际HC88详情出现而断言失败；没有把失败抹掉或冒称独立浏览器结果。原46ed前置HC141日期顺延后的相邻顺序另有HC91/HC142/HC150控制。

修复手机每行96px，标题/日期各44px且不收缩，≥640保持64px紧凑行。SVG不依赖固有viewBox比例推导高度，显式占满全列并与真实时间轴宽度一致；统一虚拟行坐标乘整列CTM缩放。15行在320/390/639分别1440px整列，640/768/1440分别960px；三依赖实际端点与对应bar行中心差最多0.5px（行边框）。所有row内目标容纳、互不重叠，bar/host中心一致；baseline/版本线仍在所属host，日期X算法未改。

作者Chromium分四份结果，不把脚本计数当全站通过，也不称独立复审：

- `pointer.json` 31组：四宽度HC142与实际两邻行HC93/HC88的日期/事项正常locator.click，各重复两次；Cancel、Escape、重开原值、无业务写入、准确点击记录/正确详情、来源焦点；四宽度HC142 Back/Forward；639/640几何；320真实Tab/Enter/Cancel。没有程序focus/dispatch/force，原生事件只读记录用于断言实际命中按钮。
- `feedback-drag.json` 10组：四宽度依赖完全调回原值的no-op提示/数据相等/来源焦点，原值保存不误警告、Cancel/Escape无写入、旧1440 pointer no-op原提示、正常HC144日期保存与HC141→142→150真实顺延。用正常UI建立fixture，无store fixture写入；必要的store读仅用于断言。
- `reordered-tap.json` 2组：320/390经HC141正常UI改为10-02..10-06，原依赖顺延形成HC91/142/150邻行，逐个native tap日期/事项，仅本行动作，Cancel/关闭无写入、来源焦点。模拟hasTouch，不是实体触屏。
- `drag-equivalence.json` 2组：1440新context同seed，HC144真实mouse move+2天/右缘resize+2天分别与另一fresh context日期输入的全部事项计划一致；不修改原currentTarget.parentElement宽度归一方式，move使用时间轴host宽844、resize使用原bar宽128.421875，span46。没有force/dispatch或改变日期算法。

四组pageerrors均[]，合计45控制组（31+10+2+2）。320×568、390×844、768×900、1440×900相邻行/编辑和键盘图，以及320/390重排tap图逐张实际查看；窄屏目标独立，SVG端点在条形正确行，日期字段/Save/Cancel可见、焦点环清楚、页级无横溢出。字体/颜色未改；原E普通日期/保存6.82074、错误5.61695采样只作继承证据，不冒称本轮全站重新认证。

## 实际命令/退出

环境Node26.10.0、Python3.14.7、Playwright1.63.0/Chromium145.0.7632.6，复用既有依赖、无安装。仅先确认空闲的4183，仓库 `VITE_AUTH_ENABLED=false npm run dev -- --port 4183 --strictPort`；收到断线提醒后实际lsof仍为原node4063，未重复启动，未动8089/4179或其他服务。

| 命令 | 最终结果 |
| --- | --- |
| `python3 ../ui-e-gantt-target-evidence/red.py`（未改46ed） | 0，两宽度反例按预期成立；此前猜邻项/即时内容断言的两个harness失败退出1另存 |
| `python3 ../ui-e-gantt-target-evidence/verify.py` | 0，31组；pointer-final.log/JSON和六宽度geometry.json |
| `python3 ../ui-e-gantt-target-evidence/feedback-drag-regression.py` | 0，10组；feedback-drag.log/JSON |
| `python3 ../ui-e-gantt-target-evidence/reordered-tap.py` | 0，2组；reordered-tap.log/JSON |
| `python3 ../ui-e-gantt-target-evidence/drag-equivalence.py` | 0，2组；drag-equivalence.log/JSON |
| `npm run test:pm`（最终） | 0，57/57 |
| `node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts`（最终） | 0，55/55 |
| `npm run typecheck`（最终） | 0 |
| `./node_modules/.bin/eslint src/components/pm/gantt-view.tsx`（最终） | 0，无输出 |
| `VITE_AUTH_ENABLED=false npm run build:dev`（最终SVG尺寸） | 0，开发构建；既有module directive等warning保留，无迁移 |
| `VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183` | 0，dev/build sign-in off一致 |
| `git diff --check` | 0 |

首轮green脚本错误预设seed相邻HC91/150，实际HC93/88，保留失败日志；修正读取真实DOM顺序。随后SVG实际height按固有比例只有595.1875px，而手机row列1440px，CTM断言真实失败，原JSON/log保留；显式设置SVG高宽后全六宽度通过。两套脚本原同名green.json产生输出覆盖，保留原31组stdout，将10组结果辨识分离为feedback-drag.json，并完整重跑31组生成新pointer.json；最终文件组数和内容分别断言，不凭exit-only冒充结果。

## 官方父review与边界

46ed精确独立报告 Library `libfile_785d56964e2c819197f69935f6729a2e` v0，213036bytes，SHA256 `2d1988a889c23b2ec5c73f454ec45e5ed7f5ec95afe8b6d4af28e11f3f0eafb2`；本次官方prepare_materialize/helper回读外层与22载荷核验。报告确认no-op差异通过、完整46ed候选仍因E新P2不批准整体noMajor；本次更正历史归因并提交局部修复，不篡改旧报告。

原 setItemPlans 没有cancelled/冻结版本全面排期禁写，version scope冻结guard不是全面排期冻结；本次没有业务guard变更或全面保护验收。主Vue/planned未动，F16/F17只保留迁移约束。

旧全仓lint1error8warnings（client.server.ts:281 no-empty）、aggregate第一段187/195的8个缺fixture失败仍保留，未顺带修或重跑未变全仓矩阵；旧D/E来源/门禁/草稿证据按准确父/祖先引用，不声称本轮全部重审。Safari、实体触屏/IME/辅助技术/生产auth/全部toast瞬时时序未覆盖。F07/F09/F10/F13/F14/F15后续准备名单和具体未做理由另列，代码仍等本P2新精确复审门禁。

仅本地提交/可恢复包/官方Library回读；无push/PR/merge/deploy/远端删除/force。保存全部当前源、可达Git历史、精确父patch、manifest、关键红绿/日志、原审计、旧父评审引用及独立F准备文档，供复审；不把包保存成功当独立review通过。
