# D：当前任务优先呈现

精确基线 bd9bc5a5477a9c2486e18e8f1890b95fd48f6e47，独立 scoped noMajor 复验包 libfile_a055a52376b88191b62ba8e7f2911133 v0 已官方取回，235475 字节/SHA256 01e814938a6da5633a4b72b0bfe62eeee92491ae46d7b5d99374b19cc8c4eede，24 个 manifest 文件匹配。原工作树冻结，D 从独立 codex/ui-task-first-d-20261002 / ui-d-worktree 推进。开始只读 origin/main 仍为 097ed24afec27e8cfc0caf0d7c45a12354fa0cd9；不盲合并。

原审计依据为已保存的 ui-audit-20261002/hc-ui-visual-audit-20261002.md 的 F08 与批次 D Files。其 11 文件允许范围为 routes/index.tsx、biz/mine-list.tsx、pm/{dashboard,assignment,sprints,dependencies,tests,worklog,releases,trace,stats}-view.tsx。当前 main 已优先显示工作台我的任务、分配任务和真实统计；先保持这些路径，必要改动窄化至 tests/releases/worklog/trace/dashboard/sprints/dependencies 七个 view，以及本批计划/验收文档。不修改其他源文件。

## 决策

- 测试默认优先已有 RUNNING 运行及执行动作；新建运行、切换列表、用例/套件管理按需展开，表单保持挂载，不因为收起丢草稿。运行与用例实际业务状态/快照算法不改。
- 发布先选中发布单和真实 gate/审批/发布动作，版本范围默认摘要可展开，版本与环境创建收起。所有冻结/审批/豁免检查沿用原 store，不新造 gate。
- 工时按审批任务、本人登记、全部记录分区；审批动作与权限合同不变。登记和分析按需展开，待审编辑沿用原校验/取消行为。
- 追溯当前选中对象先显示，有明确选择控制；总览列表/计数按需展开。保留真实影响范围、证据矩阵及导出。
- 仪表盘优先已有风险与我的未完成，链接到既有任务模块；指标继续使用当前口径，汇总按需展开，不虚构趋势或新指标。
- 迭代/依赖优先已有对象/冲突/选择信息，创建区域收起且保留原输入。只调整局部结构与呈现，不引入通用导航/状态框架或依赖。

## 本批验收

各实际改动模块新增真实 Chromium 任务链：默认主任务可达、重复打开/收起、Cancel 不写数据、输入/选择保留、详情与 Back/Forward 来源，以及业务动作实际结果。每模块 320/390/768/1440 截图与文字/控件裁剪边界抽检；复用现有 palette、Modal 焦点、菜单、水平/垂直滚动合同。加载、无数据、错误/未保存用真实现有存储失败和空数据状态验证，不制造产品能力。

PM/app-data/auth 相关单测、typecheck、变更文件 lint、auth-off build:dev 和 check:auth。不运行包含 db:migrate 的 build，不安装新软件。只用本任务 4183，避开 8089/4179，结束释放。旧全量 lint/aggregate 失败单独保留，本批新检查重新计数；旧 81/70 不作 D 新通过。

不修改状态机、权限、审批、冻结、store/domain/persistence、无保存保护、主 Vue、planned 能力，不开始 E，不 push/PR/merge/deploy。最终保存精确本地候选，提供 D delta 小复审包而不重封历史。
