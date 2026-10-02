# E 甘特窄屏日期目标 P2 局部修复

精确父 `46ed121f7244947e16c8916105a44cf6461dc92b` 冻结，独立 worktree `ui-e-gantt-target-fix` / `codex/ui-e-gantt-target-fix-20261003`。只做本地修改、验证、提交和官方 Library 复审包，无远端写入。

## 问题与归因更正

B 已有 `<640px main button min-height:44px`；E 新增第二枚日期按钮，却仍在64px固定行内纵叠两枚按钮，至少88px，日期目标溢出并被下一行事项按钮遮挡。这是 E 新 P2，46ed只继承，不是pre-E旧日期入口缺陷。此前“既有布局限制”的分类错误；46ed原提交、失败日志与Library包不改写，新覆盖矩阵明确更正。

## Files 白名单与最小决定

1. `src/components/pm/gantt-view.tsx`：<640行改96px，两枚按钮各44px且不flex-shrink；≥640保持原64px行与原紧凑目标。所有真实/虚拟行同一响应式行高；时间轴host、bar/基线/版本线随grid行容器。SVG显式100%整列高度及“整列宽减侧栏和12px右距”的宽度，原viewBox虚拟行距统一缩放到实际容器；`ROW`仅更名`SVG_ROW`说明虚拟坐标。没有新media hook、通用布局框架或隐藏动作。
2. `docs/plans/2026-10-03-ui-e-feedback-fix/coverage.md`：更正 F05/F11 归因、F08完整体系边界、46ed正式评审引用；F07/F09/F10/F13/F14/F15仍待单独有限F。
3. 本目录 `plan.md` / `acceptance.md`：实际命令/退出码、图证/几何、反例和合同边界。

不改全局CSS、日期/依赖/排序算法、setItemPlans、状态机/权限/审批/冻结/持久化、package/lock、路由或主Vue/planned。保留44px手机触控目标和两个独立动作，不forceClick、dispatch或程序focus代替真实操作。

## 验收门禁

- 未改46ed在320/390真实红反例；正常locator.click被邻行标题拦截、原始44+44与64行矩形保存。源码历史确认015只有一个目标，5ea新增第二个，B触控规则先存在。
- 新320/390正常pointer逐个点HC142/实际前后行；日期只开本行日期表单、事项只开准确详情；重复、Cancel、Escape、Back/Forward、无写入和来源焦点。
- 768/1440同动作；639/640断点；全15行两个目标均容纳、不重叠；bar中心在host中；3条依赖端点经真实SVG CTM对齐正确行，半像素边框误差允许。页级横滚和菜单不回归。
- 最初失败fixture通过HC141的正常UI日期保存顺延后，在320/390补HC91/142/150原生tap；这是Chromium模拟touch，不声称实体设备。
- 重跑46ed的no-op/原值/正常保存/Cancel/Escape/旧pointer/no-op/顺延10组，算法不变；PM/auth/type/changed lint/build:dev及认证一致性。普通build包含迁移禁止。
- 新精确提交独立review前不能称新候选noMajor；F只准备Files/设计/验收，代码须等本P2精确复审通过。F准备文档在worktree外，不夹其他设计改动。
