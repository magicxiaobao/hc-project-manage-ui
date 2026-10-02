# 批次 F 有限补齐计划（精确父提交门禁通过后实施）

来源：父任务审 F01–F17 覆盖矩阵后的明确范围决定。先独立收口 E 新日期目标遮挡 P2，精确新提交独立复审通过后才能开始 F 代码。本文件在候选 worktree 外，不夹入 E 修复提交；准备阶段没有F实现。本轮父任务在精确0b8b506正式独立 scoped noMajor 后已批准此有限白名单实施；实际结果见本目录 acceptance.md。

## 有限 Files 白名单

| 项目 | 允许文件 | 具体设计与复用 |
| --- | --- | --- |
| F07 导航 | `src/components/biz/project-sidebar.tsx` | 静态四组“概览”“计划与交付”“质量与发布”“项目管理”，保留全部16个既有链接、active判断、项目params、抽屉和返回关闭；不加折叠状态/路由/角色能力过滤。概览=仪表盘/统计；计划交付=看板/待办/迭代/事项/需求/甘特/依赖/追溯；质量发布=缺陷/测试/版本；项目管理=分配/工时/设置 |
| F10 类型文字 | `src/components/biz/issue-card.tsx`、`issue-row.tsx`、`src/components/pm/list-view.tsx` | 复用已存在 `domain.kindLabel(item)`（含真实 taskType/史诗/故事），无需新枚举。卡片元信息行、紧凑行/表格编号附近显示必要文字；保留key/准确status/父键/点数，避免新表格列，不改排序/行编/拖拽合同。详情已用kindLabel，不重复改 |
| F09/F15 保存反馈 | `src/components/pm/shell.tsx`、`src/components/biz/issue-dialog.tsx`、`src/components/pm/list-view.tsx`、`settings-view.tsx`、`tests-view.tsx`；必要时仅新增 `src/components/biz/persistence-status.tsx` 纯展示组件 | 复用 `ready/persistenceError/retryPersistence` 和现有 `notifyPmChange/changeFeedback`，共享组件只接收事实/原retry回调。错误+重试同时就近出现在当前详情编辑/列表当前编辑行/设置保存区域/用例detail保存区域；全局错误和beforeunload保护不删除。明确“本机”与“仅在当前页”。设置/用例尚未提交的局部草稿不能显示已保存；用局部draft与真实对象比较或只显示模式说明，不凭error=null伪造成功。没有异步存储状态，故不造“保存中”、计时器、事件总线或新通知框架 |
| F13 空态 | `src/components/pm/list-view.tsx`、`tests-view.tsx`（复用同上文件） | 筛选无结果给就地清空现有query/kind/mine/hideDone动作，保留sort与来源/URL安全；真空数据区别于筛选空，使用现有创建工作项入口。测试无生效用例时引导展开现有用例库/套件、打开已有用例、恢复现有已归档用例或复制已有用例为草稿；不把创建套件当成创建用例 |
| F14 真实任务层级 | `src/routes/index.tsx`、`src/components/biz/mine-list.tsx`、`src/components/pm/stats-view.tsx`、`assignment-view.tsx` | 保留097 main已有MineList/紧凑行、现有SprintSummary/FeedPreview和stats真实汇总/历史；仅将未完成mine按真实dueDate（有日期的临期/逾期先，日期升序）、现有priority及key稳定排，文案说明无dueDate不推断。stats置已有高优先级行动列表靠前，并提供现有事项/缺陷/迭代/版本入口，复用已有URL筛选能力的地方准确携带筛选，不声称缺陷页支持未有的条件。assignment零任务成员集中在可展开只读区，保留可见人数及原分配候选，不隐藏成员、不改负载公式 |
| 必要样式 | `src/styles.css`（条件 Files） | 仅若既有320行布局无法容纳类型文字/反馈时增加对应组件局部规则，不动全局44px规则、色彩合同、既有看板高度或菜单；若不用则不修改 |

最多14个源文件（列表去重后：project-sidebar、issue-card、issue-row、list-view、shell、issue-dialog、settings-view、tests-view、persistence-status、routes/index、mine-list、stats-view、assignment-view、styles；不需要新增共享barrel导出，直接import）。实施前据精确 E 修复父提交重新核对每个 Files；超过此白名单先报告具体必要性，不顺带扩模块。

不允许：package/lock、store/domain/schedule/persistence/navigation合同、认证/权限/审批/状态机/冻结、任何路由定义/后端、主Vue、planned能力。原 setItemPlans 仍无全面cancelled/冻结排期guard，不在F伪装补齐。

## 当前源码确认与具体保留项

- F07：现 project-sidebar 的16个链接/抽屉已可复用，只需静态分组；不做项目切换器，因为缺少本次授权的产品行为且审计主目标是可发现性；不做角色菜单裁剪，因为会触及权限/capability事实。
- F10：IssueDialog已显示kindLabel；列表与卡片尚缺类型文字；不为已具备的详情重复写组件。准确status不得为类型让位，320检查每个必要字段的真实裁剪交集。
- F09/F15：现 bindPmPersistence 同步订阅业务数据并写localStorage，成功/失败用现有persistenceError记录；ready表示读完成，不是当前表单已提交。原retry不丢未保存内存改动。无服务器持久化证明，所有保存反馈只称本机；不建逐字段历史/后台同步/通用dirty系统。
- F13：源码实际仅有createSuite/copyCase/updateCase，CaseDetail已有“复制”“归档/恢复”；没有从零创建TestCase的UI/action，也没有DRAFT/REVIEW→ACTIVE独立UI入口。因此不能承诺“新项目先建新用例”或草稿“启用”跳转。F仅导向确实存在的套件/已有用例/恢复/复制，完全无用例项目的bootstrap能力缺口保留为未实施业务需求，明确理由而不标整项关闭。若后续源发生变化，以新源复核；不凭方法的patch能力开放未有动作。
- F14：首页main已替代固定大卡，D dashboard已有真实风险/任务行动，不重复重建；stats现有统计卡部分只是数值，迁移入口到现有模块而非新增图表/趋势/指标。无dueDate的事项仅排到后面，不用迭代日期编造deadline。零负载呈现调整不影响负责人候选、既有points/hours/未分配数据。
- F16/F17：继续仅作为主Vue迁移禁越界约束，七态/五gate/豁免审批/expectedStatus/admin/server facts和planned不能用React样板代替，原型不得宣称实现。

## 授权的验收清单（执行范围及边界见 acceptance.md）

1. 新提交准确父/改动Files/dirty/tree身份；保存设计决定和实际命令/退出码；原E/P2候选冻结。本地提交和官方Library可恢复包，无push/PR/merge/deploy。
2. F07：四组含且仅含原16个项目链接，320短屏/390/768/1440所有入口正常pointer/Tab可达；抽屉初始焦点、Shift+Tab、Escape、重复开关、导航后关闭、active与项目params准确，无新折叠系统。
3. F10：长key/长title/四种type/长taskType，320/390完整key+精确status、类型文字可读且不占用状态空间；768/1440紧凑表格排序/负责人状态点数行编、同列排序/WIP仅提示保持。类型/状态不只靠颜色；普通文字/hover对比≥4.5并保存实际采样。
4. F09/F15：对详情即时改、列表行编、设置/用例明确提交分别覆盖成功落盘、QuotaExceeded/权限写失败、失败内存保留+beforeunload、导航/模态仍就近可見、重试成功；读失败不覆盖磁盘、原retry合同一致。未提交局部草稿、校验拒绝/no-op不能冒报已保存；不新增假的等待中状态。键盘焦点/双击/Cancel和原保护回归。
5. F13：query/type/mine/hideDone混合筛选空逐项/一键恢复、URL与sort不丢、返回详情保留来源；项目真空数据使用既有创建。测试zeroActive含ARCHIVED与全空两种，分别验证链接/展开/恢复/复制真实动作和准确缺口说明，原createRun至少一用例拒绝保持；不新增state动作。
6. F14：用现有真实dueDate/priority/完成/取消数据控制临期稳定排序，无日期不伪造；不同currentUser/project切换后正确；stats入口到现有正确模块/已支持筛选，无“已筛选”虚假文案；zero成员可找回、未分配/有任务成员不被藏，原分配/取消事项可见/工时公式保持。
7. 320×568、390×844、768×900、1440×900截图及pointer/keyboard，菜单完整可达、正常文字/焦点环、横纵滚动/四列/来源Back/Forward不回归。E新日期目标P2独立review若未通过，不运行F实现验证或开始F源码。
8. PM57、auth55、typecheck、changed-file lint、仓库build:dev及live认证一致性；普通build含迁移不执行。旧全仓lint1error8warnings/aggregate187/195的8缺fixture失败单列保留；Safari/实体touch/IME/辅助技术/生产auth等未覆盖场景不借此关闭。

完成F后重新逐项重写F01–F17矩阵，区分实现/证据/仍不做的具体理由；不以批次F命名消除未做的case bootstrap或Vue迁移限制。

## 已核验的实施父提交

精确0b8b5061578d51f8bc40bce6a5a3efa3a3913211，唯一父46ed121f7244947e16c8916105a44cf6461dc92b，tree2f17097108a787d785069bf239eab5fe68c916f5。正式独立报告libfile_a37aef1b2b7881918193c1a3568a0339 v0，203710bytes，SHA256 c99c4f7e72afbd81dbd32332a0e201eaceedcade745a50b605caa5f9ef312d40，官方回读外层与31载荷通过。报告批准E手机日期目标P2 scoped闭环，独立浏览器及真实live resize未覆盖。当前新F不得继承这个noMajor为自身批准。
