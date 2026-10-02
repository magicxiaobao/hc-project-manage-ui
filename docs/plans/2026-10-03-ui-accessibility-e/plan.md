# E：规划可访问操作

精确基线 01509017a649ff0701175333692d98ae94dd17d3；已官方物化并读原文的 D-fix 独立 scoped noMajor（三原 P2 闭环）：libfile_fa1bb383443c8191ac7c1b4b7b370dcd v0，434961 字节/SHA256 d4b08faffc6d269a562f66e7e4bd9bfc7e8b0f548087bca49efe3fcb4c47f395，原 manifest payload 全部匹配。本 E 不能把该结论延伸到新候选。独立 codex/ui-accessibility-e-20261003 / ui-e-worktree；原 D 和 D-fix 工作树冻结。

开始只读 git ls-remote origin refs/heads/main 退出0：远端仍 097ed24afec27e8cfc0caf0d7c45a12354fa0cd9，与 D 开始一致；本地 main/origin-main 是 5264c9b10f48f4456d3b71e888c02a7c68967482，不盲合并或 fetch。没有仓库/祖先 AGENTS、仓库 .agents；应用已读全局 webapp-testing 的 Python Playwright 验证方法。托管 worktree 工具当前环境不可用，按授权 git worktree add 建立本地分支。

原审计 F11/F12 / 批次 E 白名单：pm/gantt-view.tsx、pm/requirements-view.tsx、biz/date-fields.tsx、biz/issue-properties.tsx。另按明确授权窄改 pm/navigation-focus.tsx 处理 P3：用户闭图后 Forward 旧详情再 Back，保持图关闭，避开隐藏来源并落可见 fallback。不重开用户闭图，不写通用树grid/键盘调度框架、不引依赖。

设计：甘特行增加原生按钮和有标签的局部日期表单，保存与拖拽共用原 alignPlans/setItemPlans，保留同日边界、依赖顺延、Cancel 不写、数据持久化/未保存合同。展示起止与进度真实文本；详情仅补实际计划/迭代回退说明，原到期日、工时日期编辑不改。需求分支用原生 button 表示 aria-expanded/controls 和含事项键的名称，子容器稳定存在但隐藏，叶节点没有虚假的展开操作。焦点恢复仍保留旧导航键/RAF/dialog 守卫，只跳过不可见候选并回退可见页标题。

验证：原样015先红证；本机 Chromium 全程键盘日期保存/取消/空/反向日期、原拖拽/resize与依赖结果对照、需求 Enter/Space/全部展开收起、详情 Back/Forward/Escape/重复操作、P3序列保持用户闭图及可见焦点。另按独立复审补充 fresh context 双 RUNNING/APPROVED 从自动选中对象直接完成/发布，不先点selector；之后显式切另一发布单清豁免、原gate拒绝无豁免。四宽320/390/768/1440保持B/C布局/焦点/菜单/滚动。

只用空闲4183和现有依赖；PM/auth/type/变更lint/开发build/auth一致性新跑，旧全仓lint1error8warnings与aggregate187/195缺8fixtures单独保留。不执行生产build或迁移、不改主Vue/planned/store权限/状态/审批/冻结，不push/PR/merge/deploy/远端删除/force。最终精确本地commit、离线bundle+patch+manifest/报告/图证，经当前Library官方保存及回读SHA，交独立E复审。
