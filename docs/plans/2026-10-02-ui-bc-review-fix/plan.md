# B/C 集中复审修复

冻结原 B/C 提交 4bca2ea4b84f0ec7922e3d52e905e775fc71d43c，从该提交建立 codex/ui-bc-review-fix-20261002 / ui-bc-review-fix-worktree。不覆盖原工作区，不 reset/stash，不修改 Git 身份，不 push/PR/merge/deploy，不启动 D/E。

读取独立报告 libfile_33a2c9db426c819184b158bd61401d68 v0：195264 字节，SHA256 22dc1eb5f37d865545488540515d923cd84ca827fe579f187c97f5fe42dc13f2，10 个 manifest 文件匹配。报告对精确 4bca 提出两处 C 的 P2，短屏卡区高度为源码推断；本机均通过真实 Chromium 复现。

## 最小决策

- KanbanColumn 加 max-width:100%，使 320px 的单列从 288px 缩至可用 224px；仍保留列间水平滚动，不隐藏或截断准确状态/key。
- KanbanBoard 在 <1024px 采用自然外层高度，卡区高度 clamp(18rem,50dvh,36rem)，由主页面承接外层滚动，同时保留列内独立滚动与原恢复节点。卡区最小 288px，避免被 shrink-0 控制区挤成 0。
- BoardView 只改变手机标题/看板选择器的排列，完整说明不再被并排选择器挤成极窄文字列。未移除提示或筛选字段。
- 窄屏筛选面板改为视口内固定位置 x80/y64，宽度不超过 viewport−96，最大高度 viewport−80，内部滚动；>=1024px 保持原触发器右对齐。没有引入通用弹层框架或新依赖，筛选值、标签、负责人、取消开关、URL 回调和外点关闭均保留。
- 实际键盘复验发现原菜单 Escape 会卸载焦点元素并落至 body；仅在焦点属于该菜单时，既有 Escape 处理恢复自身筛选按钮。焦点位于其他界面时不转移。此为本菜单的局部 UI 修复。

源范围为 issue-filters.tsx、kanban-board.tsx、kanban-column.tsx、board-view.tsx、styles.css 五个文件；BoardView 的单行呈现调整是已授权短屏容器/信息层级修复所需。未改 store/domain、状态机、拖拽处理、筛选合同或业务能力。

验证和截图保存在 worktree 外 ui-bc-review-fix-evidence；预览只用本任务 4183，避开 8089/4179，不涉及 Docker、MySQL、迁移、软件安装或安全设置。
