# UI 样板可靠性修复

来源：magicxiaobao/hc-project-manage-ui 固定提交 5264c9b10f48f4456d3b71e888c02a7c68967482。完整 185 个文件已按 Git blob SHA 验证；未发现 AGENTS.md 或 .agents/skills。本计划不改主项目、不发布。

## 目标

修复可证实的存储失败反馈、冻结版本路径不一致、取消筛选不可见与拖拽自动原因。保留现有技术栈和页面设计，不扩大为视觉重构。

## Files 白名单

- src/lib/pm/store.ts
- src/lib/pm/persistence.ts（新增）
- src/lib/pm/persistence.test.ts（新增）
- src/lib/pm/feedback.ts（新增，统一成功反馈不得假称持久化成功）
- src/lib/pm/store.test.ts（新增）
- src/lib/pm/board-presentation.ts、board-presentation.test.ts（新增）
- src/components/pm/shell.tsx
- src/components/pm/settings-view.tsx、tests-view.tsx、sprints-view.tsx、releases-view.tsx、backlog-view.tsx（仅成功反馈调用）
- src/routes/projects_.new.tsx、src/routes/me.tsx（仅成功反馈调用）
- src/components/pm/issue-page.tsx
- src/components/pm/board-view.tsx
- src/components/biz/kanban-board.tsx
- src/components/biz/issue-card.tsx
- scripts/pm-test-register.mjs（新增测试启动辅助）
- package.json（仅 test:pm 脚本及总测试接入，不改依赖）
- docs/plans/2026-10-01-ui-reliability/plan.md
- docs/reports/2026-10-01-ui-reliability.md

如需要改其它调用点，先补充并说明白名单；不改锁文件、auth、数据库、部署或主项目。当前不实施可选弹窗/标题改造，避免未经视觉验证扩大范围。

## 顺序

1. 在未修改基线新增回归测试，记录失败。
2. 存储恢复/保存错误明确反馈，错误数据不得自动删除或覆盖；保证初始化不无限等待。
3. 版本变更统一校验，错误不改原数据。
4. 取消区与筛选一致；需要原因的拖拽先确认，取消/过时操作无副作用。
5. 增量测试、官方依赖可用时 typecheck/lint/build，独立评审完整 diff。

## 验证

纯函数/状态测试不能替代浏览器。尝试合法官方 npm ci（先 ignore-scripts）；不绕过网络拒绝。构建用不带数据库迁移的 build:dev；不运行生产 build 内的 db:migrate。真实浏览器若可用则补截图和键盘/反复关闭流程；若不可用如实列明 NOT_RUN。

H1 真实运行基线因 Library403 仍 NOT_RUN；本独立样板可靠性修复不依赖假绿基线，主项目移植验收尚待。
