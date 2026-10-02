# UI 批次 A：键盘弹窗与来源导航

基线：`codex/ui-reliability-r3-20261002` / `3745ae833a1d4df955e306e4d074e44923c411e0`，开始时 clean。沿用独立 worktree，原 UI main 与主 Vue 只读。没有适用的 UI AGENTS/.agents 本地技能；已读取 Playwright skill，因 CLI 未安装且用户禁止新增软件，使用既有 Playwright/Chromium。

## Files（明确范围）

- `src/components/biz/app-modal.tsx`：共用库 Modal，允许详情/搜索宽度与标题。
- `src/components/biz/issue-dialog.tsx`、`search-dialog.tsx`：移除手写遮罩，复用焦点、Escape、背景隔离。
- `src/components/pm/issue-page.tsx`、`use-go-item.ts`：记录与校验来源，关闭返回合法来源，连续详情沿用原来源。
- 新增 `src/lib/pm/navigation.ts`、`navigation.test.ts`：来源校验、历史步数、URL筛选的纯规则与有意义边界测试。
- 新增 `src/components/pm/navigation-focus.tsx`：来源焦点/滚动恢复，较新导航取消过期恢复。
- `src/routes/p/$projectKey.tsx`、`src/components/pm/list-view.tsx`、`board-view.tsx`：URL承载事项/看板筛选，不改筛选业务语义。
- `src/components/biz/issue-row.tsx`、`issue-card.tsx`：给可返回的原触发控件稳定焦点标识。
- `src/components/biz/child-issue-list.tsx`、`create-issue-dialog.tsx`：相关事项/新建详情携带原来源。
- `src/components/pm/shell.tsx`：挂载焦点恢复；键盘快捷键不跨活动 Modal 处理。
- `src/routes/me.tsx`、`inbox.tsx`：纳入 AppShell，明确工作台返回入口。
- 本计划与批次验收报告。

不修改 domain/store/persistence、主 Vue、生产 API、状态机、权限或 planned 门禁；保留 R3 读取阻断、写失败重试、流转原因和当前输入草稿行为。不 push、不新建 PR；这批成果与远端 R3 分开记录。

## 验收命令

- `npm run test:pm`（含导航新边界测试与 R3回归）
- `npm run check:auth`；`npm run typecheck`
- `node_modules/.bin/eslint <实际变更的ts/tsx文件>`
- `npm run build:dev`（不执行带数据库迁移的生产build）
- 独立4183 dev服务：`VITE_AUTH_ENABLED=false node scripts/with-app-env.mjs node_modules/.bin/vite dev --host 127.0.0.1 --port 4183 --strictPort`；先核实空闲，结束停止自己的进程。
- 真实 Chromium：详情/搜索/创建的 Tab与Shift+Tab循环、Escape/Close/Cancel、原触发焦点；事项与看板筛选、深链回退、刷新、Back/Forward、连续/重复打开、较新导航不被旧焦点恢复抢占；个人/收件箱返回；R3读取阻断、写失败重试与未提交评论草稿。
- 每张最终截图实际打开检查；不把单元/静态检查当浏览器验收。

## 决策

1. 使用既有 HeroUI/React Aria Modal，不自建focus trap。
2. 筛选保存在URL；UI来源只放history state，不写业务localStorage。
3. 合法同应用来源且历史index可信时返回原条目；无来源的深链回退本项目看板。
4. 相关事项连续打开沿用首次来源；新来源会替换旧上下文。关闭重复触发只执行一次；焦点恢复检查当前条目，较新导航取消。
5. 刷新详情后返回的路由可能尚在加载，等待 status idle / resolvedLocation 匹配再恢复；无来源深链聚焦回退页面标题。
6. 共用 Modal 过滤鼠标双击的第二次遮罩点击，避免触发器第二次点击立即关闭；普通遮罩点击行为保留。

## 完成记录

实现及本批验收完成，结果见 `acceptance.md`。最终完整浏览器 27 项、补充 7 项通过，16 张截图已逐张查看；PM43 / auth55 / type / changed lint / build:dev 通过。全 lint 与聚合首段仍是已有失败，没有标成全绿。只停止自己的 4183 服务，端口已确认释放。原 UI main 与主 Vue HEAD / clean 状态再核一致；新本地成果不推送、不 PR，等待下一批指令。
