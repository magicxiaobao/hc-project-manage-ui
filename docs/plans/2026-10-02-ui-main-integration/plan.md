# A 与冻结 main 整合

输入：main `097ed24afec27e8cfc0caf0d7c45a12354fa0cd9`；A `818bddeda83f67458037edf55c227d824decba50`；复审修复 `9decb4ba03fbb03d7134a64e5f231115a0e39e73`。共同基线 R3 `3745ae833a1d4df955e306e4d074e44923c411e0`。

独立分支 `codex/ui-main-integration-20261002`，worktree `/Users/a1234/Documents/Codex/2026-10-02/task-2/ui-main-integration-worktree`。保留两个原提交及原 worktree。只做本地整合和验证；不 push/PR，不改主 Vue，不开展 B/C，不操作 Docker/数据库。不追动 main；结束时仅记录远端漂移。

## Files

从 A 带入的源文件范围：

- `src/components/biz/{app-modal,child-issue-list,create-issue-dialog,issue-card,issue-dialog,issue-row,kanban-board,kanban-column,search-dialog}.tsx`
- `src/components/pm/{board-view,issue-page,list-view,navigation-focus,shell,use-go-item}.tsx`（`use-go-item` 实际扩展名 `.ts`）
- `src/lib/pm/{navigation.ts,navigation.test.ts}`
- `src/routes/{inbox,me}.tsx` 与 `src/routes/p/$projectKey.tsx`
- 保留 A 的三份计划/验收/复审日志；新增本计划和整合验收记录。

main 已包含 R3。保留其 store/domain/decoder、新业务页、排序、行内编辑、WIP、克隆/前后导航、新字段，不再次覆盖 R3 包。必要的状态范围仅用于页面来源恢复及当前筛选/排序，不引入新持久化框架。

## 冲突决策

| 文件 | 决策 |
|---|---|
| issue-card | main 父编号/点数/前插排序 + A 焦点标识；取消区卡片禁拖拽 |
| issue-dialog | main 新头部/属性 + A AppModal、焦点/键盘、来源继承与防双击背景关闭 |
| kanban-board | main catalog/rank/WIP + 取消只读区与横向/四列滚动标识；待确认不提前排序 |
| board-view | main 新筛选/rank/WIP/browse + URL 状态；恢复 R3 原因确认、状态竞态/防重，确认成功再排序 |
| list-view | 保留 main 紧凑表格/排序/行内编辑；即时 query + URL 同步 guard，排序保留，稳定来源焦点 |
| use-go-item | main browse 助手 + A 首次来源/history/焦点/各滚动捕获；相关事项和 clone 不改变首次来源 |

文本自动合并的 issue-page/inbox/kanban-column/issue-row 仍人工核对。通知过滤后原目标消失时恢复来源页标题焦点；较新导航不被旧恢复抢占。

## 验证

PM、auth、type、变更文件 lint、build:dev（不运行含数据库迁移的 build）。真实浏览器验收：排序/筛选返回和 Back/Forward、前后/clone/父子导航、四列及横向滚动、即时 query/光标/浏览器 composition、通知未读目标消失、未保存/retry、原因取消/空原因/重复确认/状态变化、只读取消区、移动端。截图和原始记录放 worktree 外，避免原件/依赖/构建产物进 Git。

结论限定于整合后的精确提交；宿主物理 IME 与未测试组合不声称已验收，既有全仓 lint/.grok 夹具问题单列。

## 实测后的补充决策

真实浏览器复现：清单按编号升序打开第二项，下一项正确；Back/Forward 后上一项变成更新时间默认顺序里的其他事项。原因是详情导航清空页面 search 后，旧清单在卸载前可能更新全局 `browseIds`。来源状态增加经过基本类型校验的浏览顺序快照；前后切换优先使用首次来源的快照，clone 的首次来源也保持不变。不改 main 排序规则，不引入新存储。验收覆盖相同反例及刷新。

组合验收又发现 main 新增克隆按钮被 AppModal 绝对定位的关闭按钮遮挡；截图和实际点击均确认。标题区为关闭按钮保留右侧空间，并允许窄屏换行；保留原关闭/焦点行为，重新验收克隆与移动端。

移动端真实鼠标横滚反例：完成列来源 `scrollLeft=894`，Escape 返回后为 `0`。main 新筛选条位于看板前，也有 overflow-x-auto，旧通用选择器捕获了筛选条。看板 scroller 添加专用标识，来源捕获/恢复优先此标识；清单等页面保留既有 fallback。不引入通用滚动框架。

人工核对自动合并时保留 A 原 onPatch 失败反馈：main 曾删除该反馈，但 store 拒绝冻结版本变更时只返回错误。恢复既有 toast，避免范围修改被静默拒绝；不更改 main store/decoder。
