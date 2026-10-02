# E 作者验收

## 范围与结论

本次仅五个既有源文件（原 E 四文件加明确授权的 navigation-focus.tsx）和本目录文档。原 main/A–D/store/domain/persistence/权限/状态机/审批/冻结、主 Vue 与 planned 门禁不变；没有新依赖或通用树grid/键盘调度。精确父提交01509017a649ff0701175333692d98ae94dd17d3保持冻结，其独立 scoped noMajor 正式原包已官方物化、核SHA、读原文，纳入E包；其云浏览器 ERR_BLOCKED_BY_CLIENT 限制事实不改。

甘特局部日期输入调用与既有拖动/resize相同的 alignPlans → setItemPlans。真实计划起止与进度现在有文字和可识别的编辑按钮；纯虚拟分组头不提供虚假计划编辑。日期表单只缓冲UI输入，检查真实日历日期、必填与结束不早于开始，保留同日边界；没有改变store、inclusive/exclusive算法或引入新的冻结/角色规则。详情仅显示原计划日期及迭代回退说明，原到期日和工时日期处理保持原样。

需求分支原生按钮名称包含事项键/标题，aria-expanded与稳定aria-controls对应实际子容器；子容器用hidden收起。叶节点保留原占位几何，没有假展开操作。Enter/Space沿用原生按钮，未套树grid键盘模型。

P3焦点回退在原NavigationFocus内窄改，保持原router key/status/dialog与旧RAF守卫。闭图的隐藏来源回退到可见summary；找不到可见源时沿用标题fallback，不重新展开用户关闭的图。真实Chrome发现闭合details子节点仍可能保留layout rect，故显式识别closed details中非summary内容，不能仅以矩形非零判断可见。

## 真实浏览器证据

原样015先取得三个红证据：无日期编辑入口（15个计划条）、分支无展开语义/名称仅收起、主动闭图→Forward旧详情→Back后焦点BODY。red.json与三图留存。

最终本机Chromium主脚本13/13控制组、补充脚本3/3组通过，二者pageerrors=[]；不是凭进程exit0推断JSON结果。核心结果：

- **全键盘日期链**只用Tab/方向键/数字/Enter/Space/Escape，无鼠标或程序focus：进入HC-141、改为10/02至10/06、保存；真实HC-142顺延10/06至10/16、HC-150顺延10/17至10/21，与原alignPlans核对一致。重复打开、Escape和Cancel不写items/feeds，源日期按钮恢复焦点。HC-144同日10/07至10/07允许保存。
- 空日期与反向日期通过真实按键生成role=alert/aria-invalid，不写业务数据；有效点击入口另有实际保存/焦点结果。原pointer move/resize仍运行，分别保持原host宽度/位移算法和依赖链结果。
- 需求五个实际分支的名称/controls目标核实；Enter收起、Space展开、全部展开/收起与叶节点检查通过。纯键盘打开真实事项详情，Escape、实际挂载后的Forward/Back回到源标题按钮。
- 甘特详情显示真实计划文本，键盘Escape/Forward/Back焦点恢复，项目参数切换卸载局部日期编辑。保存QuotaExceededError仍呈现未保存提示、beforeunload阻止，恢复Storage后重试成功。
- P3主链重复两次：正常图返回后主动收起→Forward旧详情实际挂载→Back；图仍关闭，SUMMARY为activeElement且矩形在viewport内，截图可见焦点环。更新导航仍胜过旧返回RAF。
- 四个实际seed图节点正常打开图返回（Back/Close/Escape/Forward），准确焦点与scrollLeft恢复；B/C320×568四列板回到真实卡片，横向256→256、四列纵向40/152/68/0原样恢复。
- **D定点补证**：fixture在单独setup context通过原create/start/record等store动作准备；目标用独立fresh browser context及持久化快照首次进入，selector保持折叠，绝不先点当前A。自动A直接完成后仍A、定向复测动作存在，B仍RUNNING；自动release A直接填自己的豁免发布后仍A/PUBLISHED，B仍APPROVED。之后才显式切B，其waiver为空，原gate拒无豁免，A快照不变。这组是真正fresh默认选择的浏览器证据，未更改原D显式选择记录或把旧脚本改称反例证明。

四宽320×568、390×844、768×900、1440×900：甘特、需求、依赖、四列看板默认16图，甘特编辑四图，附状态/焦点图。documentElement无页级横溢出，短屏字段焦点/Cancel可达；按需主区域滚动保持原合同。抽检320编辑/需求、1440编辑、P3焦点图；深层需求沿用原列宽/截断布局，不称全面响应式重新设计。新增日期文字/保存按钮/错误正常文字实测对比均≥4.5，保留原palette，不宣称完整WCAG/所有平台。

## 命令/退出码

| 实际命令 | 退出码/结果 |
| --- | --- |
| git ls-remote origin refs/heads/main | 0；097ed24，未漂移；本地main/origin-main仍5264c9b，不合并/fetch |
| git worktree add -b codex/ui-accessibility-e-20261003 … 01509017… | 0；独立本地工作树 |
| npm run test:pm | 0，57/57 |
| node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts | 0，55/55 |
| npm run typecheck | 0；最终可见性修改后再跑 |
| ./node_modules/.bin/eslint src/components/pm/gantt-view.tsx src/components/pm/requirements-view.tsx src/components/biz/date-fields.tsx src/components/biz/issue-properties.tsx src/components/pm/navigation-focus.tsx | 0 |
| git diff --check | 0 |
| VITE_AUTH_ENABLED=false npm run build:dev | 0；最终源重跑，原依赖警告留存 |
| VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183 | 0；恢复后服务与build sign-in off一致 |
| python3 red.py（未经改动015） | 0，三个原样红证 |
| python3 verify.py（最终E源） | 0，13/13 pass，pageerrors=[] |
| python3 extra.py | 0，3/3 pass，pageerrors=[] |
| python3 contrast.py | 0，实际颜色/正常文字比值JSON |
| npm run lint | 1；原client.server.ts:281 no-empty，总1error/8warnings |
| npm test | 1；首段195中187pass/8fail缺.grok/app-env fixtures，后续&&段跳过；PM/auth分开通过 |

Node v26.10.0/Python3.14.7/既有Playwright1.63.0，沿用原锁文件和本机依赖。仅开发构建，未运行含迁移的生产build。

## 恢复、失败记录与限制

首次新焦点判断只看layout rect，真实P3回归失败后按闭合details祖先修正；这是实际产品修复，保留verification-initial日志/JSON。脚本另外曾误用/p/HC/board、截图Path拼接表达式，修正为实际/p/HC路由。快速连续Tab在既有Sonner顺延通知存续时会短时在末按钮与通知LI循环；轨迹留存，最终纯键盘链等待通知真实退出后再继续，不改共享toast或用程序focus/鼠标伪装通过，不声称通知期间所有快速按键时序均覆盖。

Mac出现短暂执行连接中断；未完成最终验收当时保持NOT_RUN。恢复后读取原工作树/会话，原会话不能恢复；经只读端口与进程核对，4183无监听、无原vite进程后才启动唯一恢复服务。未假定断线自动结束进程、不重复启动、不切云、不改系统安全/网络设置。原dev.log与dev-recovered.log分别保留，没有自动审批拒绝或远端写入。

这是作者E窄验收，最终精确E提交仍需独立复审。保留全仓旧失败、独立浏览器限制及原D证据差别；没有执行main整合或发布。交付完整离线bundle、父015→E patch、源/包manifest、上述图证/日志及报告，经当前Library官方保存/回读校验后冻结。任务4183结束释放。
