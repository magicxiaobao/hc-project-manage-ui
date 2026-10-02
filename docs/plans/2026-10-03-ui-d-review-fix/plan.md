# D 独立复审修复

冻结父候选：5870488bbbb96a05ba00dc3c94010029f9bb94cf（父 bd9bc5a5477a9c2486e18e8f1890b95fd48f6e47）。原 codex/ui-task-first-d-20261002 / ui-d-worktree 保持不动；本修复从 5870488 创建独立 codex/ui-d-review-fix-20261003 / ui-d-review-fix。原 D Library libfile_180ff99457008191b18398b603d71b5f v0 保持原样。

已官方物化并核验独立复审 libfile_4b1118da4150819182d3e873d21e0942 v0：560110 字节，SHA256 f42d6830a89fa191412f152fe2e860b194cbc7ab5d6d689279ae74242f964444。报告在 5870488 指出三项 P2，未授予 noMajor；这是本次修复依据，不能沿用 bd9 的 noMajor 到新候选。该复审因其浏览器 ERR_BLOCKED_BY_CLIENT 而采用源/store 与结构探针，本机随后重新获得真实 Chromium 红/绿证据。

## Files 与设计决定

只修改 pm/tests-view.tsx、pm/releases-view.tsx、pm/dependencies-view.tsx 和本目录文档。保留 D 其余四个 view、主 Vue、store/domain/persistence、权限/状态机/审批/冻结、planned 能力及现有导航/未保存合同。E 不开始；只本地提交，不 push/PR/merge/deploy/远端删除/force。

1. Tests：默认与迟到数据均把实际选中运行 ID 固定到局部状态/项目记忆。状态变化继续显示该运行报告与定向复测；失效 ID 回落到现存实际对象。有效对象变更才清取消草稿；同对象重选保留草稿。用本 view 的项目 key 重挂载隔离项目。
2. Releases：固定实际发布单 ID；明示切换/对象移除才改变有效对象。意见和豁免放入按发布单 ID keyed 的既有详情组件，状态变化保留同对象上下文，同对象重选不清草稿，实际切换/项目变化卸载旧草稿和操作上下文。门禁和真实发布快照沿用原 store。
3. Dependencies：只为依赖图面板保留项目内展开记忆，初始折叠，显式收起立即覆盖。返回时面板在现有焦点恢复前已展开；不修改公共 NavigationFocus/useGoToItem，不做通用自动展开框架。原列表来源返回、已有横向位置恢复沿用。

## 验收策略

先在原样 5870488 真实复现三项失败，再在修复工作树完成双对象状态转移、重复选择、草稿隔离、迟到/移除/空数据、项目切换、样例 reset、保存失败/重试，以及真实详情挂载后的四图节点 Back/Close/Forward、Escape、横向位置、列表返回和显式折叠。320×568、390×844、768×900、1440×900 三个模块截图与页宽检查。只用空闲 4183；不改变 8089/4179。

本机 Node v26.10.0、Python 3.14.7、既有 Playwright 1.63.0 / Chromium；依赖沿用现有锁文件和本机 node_modules，不新增安装。只执行开发构建 build:dev，不执行含 db:migrate 的生产 build。完整命令/退出码、真实图证和重放脚本放入新的 Library 小包；原记录保留供比较。
