# 原始审计 F01–F17：F候选后的覆盖矩阵

来源是原834行审计，Library libfile_5a6e82ba98908191884cccfd591567ea。历史矩阵保留在ui-e-feedback-fix；本表是当前判断，批次名称不等于整项完成。父0b8b506的正式独立 scoped noMajor（libfile_a37aef1b2b7881918193c1a3568a0339 v0）已关闭E新增手机日期目标P2；原46ed归因“既有布局限制”不准确，旧红证据和原候选不改写。该批准不覆盖新F候选。

| 项目 | 当前实现与证据 | 仍保留范围 |
| --- | --- | --- |
| F01 焦点隔离 | A/main/B-C原modal/search修复保留；F四宽度抽屉Tab/Shift+Tab/Escape、详情原来源/历史、用例重复关闭真实验证 | 未做读屏/完整WCAG/所有并发时序 |
| F02 来源丢失 | 原合法URL、排序、焦点、板列滚动与E关闭details回退summary保留；F列表清筛选仍保sort，真实详情Back/Forward及甘特/依赖焦点复验 | 项目看板是既有深链接fallback，不冒认实现原文所建议的所有返回列表方案；F未改来源算法 |
| F03 me/inbox返回 | 继承A/main工作区及通知来源改善 | 历史证据，不冒认本轮全面身份/通知回放；React切换身份不是Vue权限方案 |
| F04 对比 | 继承B/C字体色彩；F四宽度普通及hover实测，错误近端反馈另实测，见acceptance | 采样范围内结论，不认证全站所有背景、disabled或瞬时动画 |
| F05 窄屏 | F四宽度导航全部16入口、长类型/完整key/准确状态、保存反馈与截图；E日期P2父独立闭环、F六宽度90行/18依赖新测量保持 | 长key样本HC-12345678；任意无限输入、Safari/实体触屏未覆盖；深需求截断边界不伪装关闭 |
| F06 四列发现 | 原列切换/计数/水平提示、排序、WIP只提示保留，未动board/styles；F窄屏board长卡真实展示，E来源回归 | 未重跑全部B/C四列拖拽/横纵滚动历史矩阵，相关源码不变 |
| F07 16平铺导航 | 本轮静态四组已实现，四宽度所有原链接实际pointer导航与完整滚动可达；手机版焦点trap/Escape/重复开关 | 不加项目切换器、角色裁剪、新折叠系统；不能据React入口开放Vue planned |
| F08 表单抢主要任务 | 继承D七模块任务优先、按需展开；F新鲜D13组选择/豁免/快照/依赖/项目切换/写fail与四宽度通过 | 不等于原11文件和每tab独立加载/权限/错误恢复系统全部实现；局部草稿不新增跨导航/刷新持久化 |
| F09 动作规则 | B共享StateAction/SprintActions保留；F新增纯事实本机保存展示并复用原retry/feedback，无假pending | 尚未统一所有编辑区或所有动作视觉，见F15 |
| F10 身份类型 | F卡片、紧凑行、表格使用真实kindLabel显式文字，保留key/状态/父键/点数；四宽度长任务类型与标题图证 | 无新枚举/业务状态映射或表格列；未声称全站任意输入布局 |
| F11 甘特入口 | E原生日期表单、只读详情日期与no-op提示保留；父0b独立关闭E双按钮遮挡P2；F普通pointer31、feedback10、六宽度几何重跑 | 原move/resize/schedule/store合同不变；父独立未真实browser/live resize，F未声称Safari/实体touch或全面冻结禁写 |
| F12 需求展开语义 | E原生button key/title、expanded/controls、稳定hidden及叶节点无假button保留 | 本轮未重跑全部需求树矩阵；原独立源码/作者图证不冒认新读屏认证 |
| F13 空态恢复 | F列表真空与筛选空区分、既有create入口/清空筛选；用例zeroACTIVE准确引导库/ARCHIVED恢复/复制DRAFT，空回归保持拒绝 | **仅有限补齐**：从零createCase及草稿启用UI/action缺失不新增；创建套件不生成用例。无权限/每模块加载等分类未统一 |
| F14 任务层级 | F真实dueDate→priority→key、未设日期排后、完成/取消排除；stats原urgent前置与五真实模块入口；assignment零任务成员只读展开，原候选不隐藏 | 原aggregate/工时/点数未改，无新指标/趋势；未把每统计卡变成独立精确过滤；其他仪表盘继承D/main |
| F15 近端未保存 | F详情即时模式、列表当前编辑行、设置保存区、用例详情保存区就近显示error+retry；草稿/实际接受/Quota/SecurityError、内存/落盘/beforeunload/读阻断复验 | 未新增全站逐字段保存历史、异步pending/服务端保存；局部未提交草稿仍遵守原导航/关闭合同。行因筛选消失时仍靠原全局保护 |
| F16 Vue审批发布 | 仅约束保留；D/F发布回归为React既有合同 | 没改主Vue、七态/五gate/豁免审批、expectedStatus/admin/server facts；原setItemPlans无全面取消/冻结排期guard，不能称本批实现 |
| F17 planned | 没改Vue capability或开放planned | React可见模块不构成成熟度证据；DTO/状态/服务事实及迁移仍须单独审查 |

新鲜结果与命令在acceptance；历史A/main/B-C/bd9/D/E文档仍完整随source历史提供。父独立浏览器边界不因作者新测试自动消失。F新精确commit需要自身独立复审；作者实现/检查通过不等于新 scoped noMajor。全仓lint1error8warnings、aggregate首段187/195且8缺fixture仍准确保留，未顺带修复。
