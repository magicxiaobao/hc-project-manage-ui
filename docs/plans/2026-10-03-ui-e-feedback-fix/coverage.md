# 原始视觉审计 F01–F17 覆盖核对

核对原文：`hc-ui-visual-audit-20261002.md`，834 行，原 Library `libfile_5a6e82ba98908191884cccfd591567ea`。此表依据当前源与已保存验收证据，不能由 A–E 批次名称推定所有建议完成。当前候选沿 `main 097ed24` + A/R3 → 主干整合/复修 → B/C/复修 → bd9 → D/D-fix → E → 本反馈补丁继承；完整源、历史提交和决策文档随可恢复包保存。

“已处理”只指该 React 样板范围内的主要审计问题；不代表所有状态/浏览器或生产合同已验收。历史证据不是本次新运行。

| 审计项 | 当前状态与真实落点 | 证据与仍保留的边界 |
| --- | --- | --- |
| F01 详情/搜索焦点隔离 | 已处理主要问题：AppModal、issue-dialog、search 使用既有 modal 语义、键盘关闭与焦点恢复 | A 最终 34 个浏览器断言；后续主整合/B-C 回归与 E 键盘详情。未做屏幕阅读器、完整 WCAG 或所有并发时序认证 |
| F02 关闭丢失来源 | 已处理：use-go-item/navigation/navigation-focus 保留合法 URL 来源、排序、焦点和板卡/列滚动；E 对关闭 details 内来源回退可见 summary | A/main/B-C 真实来源回归，E 13+3 组中真实 Back/Forward/Close/Escape、320 四列恢复；精确 E 独立焦点/树源码控制 56 条。新反馈没有改返回逻辑 |
| F03 me/inbox 缺返回导航 | 已处理 React 路径：AppShell/返回工作区和通知来源 | A/main 整合真实 me/inbox/通知往返；任意身份切换仍是样板，不可搬作主 Vue 权限方案 |
| F04 文字对比 | 已处理采样范围：styles 字体/辅助色、组件文字及状态/动作文字 | B/C 2091 个普通样本最低 5.0831:1、20 组 hover 最低 4.8071:1；E 日期/保存 6.82074、错误 5.61695。没有声称全站所有背景和状态均通过 |
| F05 窄屏信息与断点 | 已处理主要导航/卡片/菜单问题：<1024 抽屉、卡片 key/准确状态/双行标题、320 短屏与菜单内部滚动 | B/C 复修 70 交互 + 6 几何组、E 四宽度。深层需求截断仍保留；本次实际 HC-142 窄屏日期入口中央指针被相邻按钮遮挡，Tab/Enter 可达，失败日志保留；此次没有改该布局 |
| F06 看板多列可发现性 | 已处理：列切换/计数/水平提示，保留四列和精确状态、排序、WIP 仅提示 | B/C 320/390/768/1024 列发现与焦点，短屏复修，390 水平 894→894；E 320 列纵向/横向恢复。未重做旧完整矩阵 |
| F07 十六项平铺导航 | **仍待设计**：当前 project-sidebar 仍平铺 16 项；抽屉可达改善不等于导航分组完成 | 未增加分组/项目切换/角色过滤；不借本次反馈扩大范围，也不把 React 入口当 Vue planned 放行依据 |
| F08 当前任务被表单挤后 | 已处理授权 D 模块：测试执行先行、发布先门禁、工时按角色任务、追溯当前选择、概览真实行动；创建/库/范围按需展开 | D 7 view、15 组浏览器；D-fix 选择 pin/豁免隔离/图状态，独立定点复核；E fresh 浏览器首次进入无 selector 点击仍保留自动 A，独立 16 生命周期控制。不是每个模块所有角色组合验收 |
| F09 动作/组件视觉规则 | **部分处理**：B 统一圆角/色彩/文字，保留 main 的共享 SprintActions/StateAction | 主整合中的共用动作替代旧孤立按钮，未新增状态；保存反馈体系仍不完整，见 F15。新补丁仅给约束 no-op 等价提示 |
| F10 事项身份/精确状态 | **主要信息已处理，建议仍部分**：卡片 key/准确状态，窄屏列表状态、表头计数；main 紧凑表格/行编/排序/父键/点数保持 | B/C 实际卡片/行回归；类型仍主要用 aria-hidden 图标，尚未全面增加显式类型文字。四列聚合没有改业务状态映射 |
| F11 甘特无拖拽入口 | 已处理核心问题：E native 计划日期按钮/带标签日期表单、真实日期/进度文字；详情显示只读真实计划并说明迭代回退 | E 作者真实键盘/点击/拖拽，独立 15 源码控制；本次补足依赖完全调回原值的反馈、原值保存不误报警。详情没有新增编辑入口；底层计划/依赖合同未改 |
| F12 需求展开语义 | 已处理：有子项的原生按钮有 key/title 名称、expanded/controls、稳定 hidden 容器；叶节点无假按钮 | E 实际键盘展开/收起/返回、独立五分支/八叶模型。没有宣称 ARIA treegrid 或辅助技术全验收 |
| F13 空态恢复路径 | **部分处理/待设计**：D 无运行时提示可展开创建；已有筛选 chip 可逐项清除 | 没有统一空数据/筛选空/无权限/加载失败分类；列表“没有符合筛选”没有就地一键清空引导，测试无生效用例的套件→用例引导未补。不虚构权限/API 恢复路径 |
| F14 指标/工作台层级 | **部分由 main 替代，D 进一步改善**：097 的 MineList/紧凑行替代原固定大卡；D dashboard 突出既有风险/待办；stats 使用真实汇总/完成历史、高优先级行可进入详情 | 首页未新增按临期/优先级排序；普通统计卡未全变成可点击任务入口；assignment 零事项成员未统一折叠。未新增指标或虚构趋势，首页/统计完整层级仍待设计 |
| F15 未保存提示离编辑远 | **保护保留，视觉问题未完全解决**：全局 persistenceError/重试/beforeunload、读阻断；E 实际 QuotaExceeded 保存/保护/重试 | 背景顶栏提示可能离弹窗编辑位置远；没有每字段保存中/已保存/未保存统一体系。内存更新或本地保存不能称服务器保存 |
| F16 发布/审批产品合同 | **Vue 迁移约束保留**：React main 已比原审计两态样例更丰富，当前 D 仅重排其已有发布/门禁/快照/角色动作 | 没有改主 Vue、审批权限或状态机。迁移须复用 Vue 七态、五类 gate、豁免审批、artifact/expectedStatus/admin/server facts。原 setItemPlans 无 cancelled/冻结版本全面排期禁写；版本 scope 冻结保护不是全面排期冻结，本批不声称建立/验收此保护 |
| F17 planned 不得样板放行 | **Vue 迁移约束保留**：没有改 Vue capability 或开放 planned | React 可见 16 项不构成 Vue 成熟度证据；各 DTO/状态/服务事实须单独审查，V1/V2 等迁移另行选择，本地 UI 收口不启动迁移 |

## 证据索引与解释

- A：`docs/plans/2026-10-02-ui-batch-a/acceptance.md`；main 替代与合同保留：`ui-main-integration/acceptance.md`、`ui-main-review-fix/acceptance.md`。
- B/C：`ui-bc/acceptance.md`、`ui-bc/decisions.md`、`ui-bc-review-fix/acceptance.md`。旧 4bca 的 noMajor 曾 withheld，不用它冒认新 bd9 验收；bd9 精确独立 noMajor 包另存 Library `libfile_a055a52376b88191b62ba8e7f2911133` v0、235475 bytes、SHA256 `01e814938a6da5633a4b72b0bfe62eeee92491ae46d7b5d99374b19cc8c4eede`。
- D/D-fix：`ui-task-first-d/acceptance.md`、`ui-d-review-fix/acceptance.md`；015 精确独立复核 Library `libfile_fa1bb383443c8191ac7c1b4b7b370dcd` v0、SHA256 `d4b08faffc6d269a562f66e7e4bd9bfc7e8b0f548087bca49efe3fcb4c47f395`。
- E：`ui-accessibility-e/acceptance.md`；5ea 精确 scoped noMajor 正式独立包 Library `libfile_4277df7d6cd4819198035f417e3df2a9` v0、653269 bytes、SHA256 `d30f8a012d07d7b9ce9b047f4175c593ab90e1787532e070ddf45817c940b0ae`，本次官方 helper 回读并逐个核对 34 载荷。该报告是原 5ea 的评审，不覆盖新反馈提交；独立方执行源码模型，没有独立 browser 回放，实际浏览器为作者证据。
- 本反馈：同目录 `acceptance.md`，包中 red/green 原始脚本、JSON、日志与关键截图。仅本次差异新跑，不把历史控制数累加为新候选整站通过。
- 旧全仓 lint 1 error/8 warnings、aggregate 第一段 187/195 的 8 缺 fixture 失败继续保留。本次没有顺带修理或声称整仓绿。Safari/实体触屏/IME/屏幕阅读器/生产 auth/所有瞬时 toast 键盘时序未覆盖。
- 远端无新写入；此前 R3 错误更新到 9decb 是历史事故，不构成新 push 授权。本地 main/origin-main 与远端 main 不同已记录，不 fetch/merge/修远端。
