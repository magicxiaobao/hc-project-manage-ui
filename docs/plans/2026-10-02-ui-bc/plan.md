# B/C 样式与响应式实施

精确基线 `cfdb7f810da8340de19b92a5350d6872f3b07cc4` 保留；父任务告知原reviewer给予 scoped noMajor（clone22/22、导航9/9）。本轮从该提交建立 `codex/ui-bc-responsive-20261002` / `ui-bc-worktree`。只做既有审计 B/C，不推送/PR、不动主Vue、store/domain、planned能力或D/E，不安装新依赖。

## 文件白名单

B：`src/styles.css`；`src/components/biz/{project-card,page-heading,labeled-field,status-chip,state-action,empty-hint}.tsx`；`src/components/pm/{backlog-view,sprints-view}.tsx`。

C：`src/components/biz/{project-sidebar,issue-row,issue-card,kanban-board,kanban-column,issue-filters}.tsx`；`src/components/pm/{shell,list-view,tests-view}.tsx`。

另本计划、色值/断点决策和验收记录；所有脚本/截图/日志在 worktree 外 `ui-bc-evidence`。白名单是允许范围，未必全部需要修改；超范围具体需求先报。

## 呈现决策

普通文字至少4.5:1，在白、灰和选中背景通过浏览器计算样式与实际背景逐项测量。保留原品牌蓝，提升faint与语义文字墨色；重要辅助/表单label14px；caption12px只用于次要信息，key与状态至少14px。采用4px间距，小圆角面板6px、共用modal12px。桌面按钮36–40px，触屏目标44px为本项目设计目标，并非合规声明。

导航抽屉优先沿用已验收 AppModal 的 React Aria 焦点/背景隔离机制，不新造全局导航框架。1024px以下隐藏230px项目侧栏并提供打开按钮；1024px保留桌面导航，真实内容验证后调整。当前main已将旧审计的测试页内部侧栏移除，无需恢复或重写。只将执行行的左右布局延迟至>=1280px，较窄视口纵向排列，避免项目侧栏与执行动作挤压内容，保持原信息顺序。

桌面事项紧凑表格、排序、行编保持；手机在同一DOM中重排表格，保留唯一触发key和select控件，显示key/准确status/两行标题及可发现的排序。IssueRow不隐藏状态；IssueCard始终显示准确状态，标题至少两行。看板保留四列、WIP、真实卡片拖拽/排序，新增列选择与数量只改变滚动位置，不改变筛选/聚合/数据。列切换不接管滚动恢复。

## 验收命令与真实场景

- `npm run test:pm`、`npm run typecheck`、55项app-data/auth单元；变更文件eslint；`VITE_AUTH_ENABLED=false npm run build:dev`；`check:auth -- --dev-url http://127.0.0.1:4183`。不运行带db:migrate的build。
- 全量lint既有1error8warnings、aggregate8缺fixture失败分开记录，不顺带修复、不冒称全绿。
- 真实Chromium 320/390/768/1024/1440：项目/待办/迭代、表格、看板、测试执行与详情；检查外页无横溢出、关键事实、两行标题、各列可发现性、对比测量；每个关键视口截图。
- 导航drawer初始焦点、Tab/Shift+Tab隔离、Escape/Close/选项关闭回触发；A详情/search/create来源与焦点；cfdb三项回归。main排序/行编/clone/前后项、WIP、卡拖拽与原因/竞态、水平与四列滚动恢复。

本机新通过结论与历史证据分开；本轮候选完成后再独立review，不能以单元测试代替浏览器验收。
