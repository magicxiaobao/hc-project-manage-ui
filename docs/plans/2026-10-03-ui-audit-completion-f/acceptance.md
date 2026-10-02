# F 作者本地验收

精确候选commit/parent/tree由包manifest、原始commit和本地git给出；本文件位于该commit内，避免自引用提交号。唯一实施父为0b8b5061578d51f8bc40bce6a5a3efa3a3913211（正式独立E P2 scoped noMajor已核验）。本轮只13个白名单源文件+本目录计划/决定/覆盖/验收，styles未用。新F作者验证通过，**新精确F仍待自身独立复审**，不继承父的noMajor。

## 实际执行与退出码

以下均在ui-f-worktree新执行，最终日志/exit文件保存于包checks/f；不是沿用D/E旧结果。Node26.10.0、npm11.19.1、Python3.14.7、Python Playwright1.63.0、Chromium145.0.7632.6，依赖复用既有安装，package/lock不改。

| 实际命令 | exit / 结果 |
| --- | --- |
| `npm run test:pm` | 0，57/57（pm-final.log） |
| `node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts` | 0，55/55（auth-app-data-final.log） |
| `npm run typecheck` | 0，最终typecheck-final.log |
| `node_modules/.bin/eslint` 后跟plan白名单内全部13个F源文件（完整argv另存commands.json） | 0，0error/1原stats-view Fast Refresh warning，最终changed-lint-final.log |
| `VITE_AUTH_ENABLED=false npm run build:dev` | 0，最终build-dev-final.log；保留构建依赖directive等原警告；无db:migrate |
| `VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183` | 0，开发/构建sign-in off一致 |
| `npm run lint` | **1**，原client.server.ts:281 no-empty，1error/8warnings |
| `npm test` | **1**，首段195项中187通过/8缺.grok或app-env fixture失败；后续串联auth/PM未执行，另行命令55/57通过 |
| `python3 ../ui-f-evidence/browser-f.py` | 0，11组，page_errors=[] |
| `python3 ../ui-f-evidence/controls-f.py` | 0，14组，page_errors=[] |
| `python3 ../ui-f-evidence/visual-f.py` | 0，52组，page_errors=[] |
| `python3 ../ui-f-evidence/d-regression/verify.py` | 0且JSON13组均pass，pageerrors=[] |
| `python3 ../ui-f-evidence/e-regression/verify.py` | 0，pointer31组及320/390/639/640/768/1440几何测量，pageerrors=[] |
| `python3 ../ui-f-evidence/e-regression/feedback-drag-regression.py` | 0，10组（green.json），pageerrors=[] |
| `python3 ../ui-f-evidence/empty-guidance.py` | 0，补拍两空态顶部准确文案（fixture隔离） |
| `git diff --check` | 0 |

仅4183临时服务；启动前lsof确认空闲，最终PTY Ctrl-C停止及lsof无监听另存preservation.json。没有触碰8089/4179或既有服务，没有生产build/迁移/远端命令。辅助ps读取被默认沙盒拒绝，未改法绕过，不影响已知PTY服务停止。

## 本轮真实浏览器范围

- **11主链**：320×568、390×844、768×900、1440×900逐个普通click全部16项目链接/正确params/导航关闭，手机抽屉Tab/Shift+Tab trap/Escape/焦点恢复/重复打开；设置草稿→本机成功→再编辑草稿→无效名称拒绝→Quota失败→内存/磁盘区别/beforeunload→原retry；列表混合query/kind/mine/hideDone空筛选一键清空保持sort/ascending，故事点成功/失败/重试，来源详情即时改与正常Back/Forward；项目真空既有创建/重复Cancel；用例前置/步骤草稿、未加一步保存不能宣称已保存、Quota/重试、复制DRAFT、零ACTIVE库展开、空回归拒绝、ARCHIVED恢复、全空缺口准确提示；首页真实日期/优先级/currentUser排序、统计正确现有入口、zero成员可展开；实际磁盘坏JSON重试前bytes不覆盖，显式修复夹具后原retry恢复。
- **14补验**：原负责人菜单完整触发区域普通click、末项苏晚正常滚动选择、真实Tab/Enter/End/Escape焦点恢复；原PAUSED原因守卫与HC142 FS依赖拒绝不写业务，HC151合法流转；SecurityError在列表/设置/用例/详情均就近error+retry及普通文字采样；用例重复Escape局部未提交字段不写对象，紧凑表格排序升/降真实key序列，实际原transition加原因准备取消fixture后首页排除done/cancelled，缺可选steps的原对象不误标草稿。
- **52视觉组**：四宽度7个路由普通文字28组、4导航hover各宽度16组、长类型表格及卡片各宽度8组。3,310普通/hover文字样本；普通最低4.888878986646179:1，hover最低5.083138897696173:1。近端错误另18样本最低4.888878986646179:1。计算使用浏览器canvas sRGB与祖先背景alpha，跳过disabled和动画非不透明样本；不是全站所有像素的WCAG认证。
- **D13保留回归**：first默认、两运行完成选择/报告/定向复测/取消草稿、两发布豁免与独立快照、审批意见隔离、late/selected消失/空数据、同SPA项目切换、四依赖真实Back/Close/Forward/焦点/显式收起、发布失败保存guard/retry、四宽度默认与图返回焦点。本脚本保留历史fixture/store准备、router导航及个别程序summary focus，不把这些描述为纯原生pointer链；真实业务提交与modal返回用正常UI。
- **E31+10保留回归**：320/390/768/1440真实普通click区分本行日期与详情、每个真实邻项重复/Cancel/Escape/Back/Forward/焦点；六宽度90行/18依赖实际几何保持手机96px行/两个44px目标、桌面64px与SVG CTM端点误差≤0.51px；Tab/Enter、原值保存无误警告、改变但受依赖no-op数据不变且可见反馈、正常保存/真实依赖顺延、既有mouse拖动反馈。不是重新运行原E完整需求树/全部草稿矩阵或实体触屏/桌面resize等价全部组合。

共生成并保留97张截图（含定位辅助图），包中原PNG未编辑。实际打开检查的当前关键图覆盖四宽度：home-320/390、nav-reachable-320/nav-768、long-type-card-320/long-type-table-390、detail-type-768、stats-1440/issues-1440、settings-1440/assignment-768、settings-quota-320/detail-quota-390/case-quota-draft-320、tests-no-cases-320/tests-empty-guidance-320/tests-archived-guidance-390、menu-discover/assignee-keyboard-end-320。其他图有对应自动几何/任务断言，不声称97张全部人工逐张审查。普通对比、精确key/状态、类型换行、菜单内部滚动、错误重试和焦点可读；文案没有服务端保存、虚构指标或假用例创建。

## 限制与交付

原审计17项当前状态见coverage.md。F07/F10与限定F09/F13/F14/F15实现完成，但F13从零用例bootstrap/启用、全模块每数据区加载/权限/错误体系、逐字段pending/历史、跨导航刷新草稿、主Vue迁移和planned都未做；不以F命名全闭审计。原setItemPlans没有全面取消/冻结排期禁写，本次也不增加或认证该保护。

仅作者本轮Chromium；Safari、实体touch、IME、辅助技术、生产auth未验证。父独立报告的无独立browser/live resize边界保留，本轮新F尚无独立审核。全仓已知失败单列未修。源码/锁文件身份、冻结worktree dirty状态、完整bundle离线恢复与精确父+patch tree/source逐字节验证、所有payload SHA以及官方Library回读结果在交付manifest/receipt；本地提交后不再修改源码。
