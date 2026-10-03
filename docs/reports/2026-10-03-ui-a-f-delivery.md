# hc-project-manage-ui 本地优化最终交付

本轮 React UI 的 A 至 F 展示与交互优化已完成限定范围的本地交付。精确代码 `15d19be5650e4fa9319270f525b778fa1a8007bf` 已独立 scoped noMajor；最后两项 P3 闭合，本次 delta 无新 P0/P1/P2/P3、无本范围必修项。这是相应精确证据范围内的结论，不表示原始 17 项审计全部功能实现、全仓测试全绿或所有设备完成验收。

用户最新边界为：“hc-project-manage-ui 优化后先提交，先不动主项目的Vue重构，因为主项目还在做集成测试，先在项目hc-project-manage-ui 上做完善。”来源 Sentinel_ab1185dcb0ec8191a37b44003f29d25f。主 Vue 规划和实施均暂停；后续仍在 UI 项目内按明确任务推进。当前授权仅本地修改、验证与提交，不授权 push、PR、merge、部署、远端删除、force 或远端修复；此前 R3 误推已由父任务说明，本次没有查询或修正远端。

## 精确代码与本地状态

- 已批准代码：`15d19be5650e4fa9319270f525b778fa1a8007bf`。
- 唯一父：`cbd58da4eb020d5a187c1736a0341c3ae5088ef2`；tree：`418325acdc4837e35be9b83a71f8504495a449fd`。
- 分支：`codex/ui-f-p3-fix-20261003`；worktree：`/Users/a1234/Documents/Codex/2026-10-03/task-2/ui-f-p3-fix`。收口开始时 HEAD 为上述代码，dirty=false；原 F worktree 保持 `cbd58da…` 且 clean。
- 本次只新增本报告的文档提交，代码批准仍指向 `15d19be…`。文档 commit、最终 HEAD/clean 和原 230 文件 SHA/Git blob/mode 不变的实际证据，见本轮交付 receipt 与最终消息；不改写已保存的源包或历史提交。
- 4183 临时服务已停止且无 listener。本次未启动服务，没有操作 8089/4179 或现有服务。

只读 `git diff` 的比较基准明确如下，没有 fetch 或将本地引用冒认当前远端：

| 精确比较 | 已批准代码的改动 |
| --- | --- |
| 本地 main `5264c9b10f48f4456d3b71e888c02a7c68967482` → 15d19be | 97 文件，+6585/−980 行；merge-base 同此 main |
| 其中生产源文件 | 58 文件，+4549/−978 行 |
| 其中测试 | 5 文件，+745/−0 行 |
| 其中脚本和配置 | 2 文件，+20/−2 行 |
| 其中文档 | 32 文件，+1271/−0 行 |
| 整合时冻结 main `097ed24afec27e8cfc0caf0d7c45a12354fa0cd9` → 15d19be | 77 文件，+3429/−810 行 |

统计包含继承的 main 页面/领域完善、R3 硬化和整合修复，不能全部归因为 A 至 F 新改。A 至 F 按各批白名单执行，保留对应实施父的业务合同；相对旧 main 中出现的 store/domain 差异不能误写成 D/E/F 新增业务能力。本报告的新增行数另计在文档提交中。

## A 至 F 范围与已接受的决定

| 批次 | 最终行为和设计决定 | 具体记录 |
| --- | --- | --- |
| A 与 main 整合 | 复用既有 Modal 的焦点隔离、Escape 和返回触发器；筛选放 URL，来源和滚动放 history。合法来源返回原条目，深链回本项目看板；较新导航取消旧恢复。保留紧凑表格、排序/行内编辑、前后事项/clone 守卫、WIP 仅提示、真实重开原因、取消事项可见和四列滚动。 | batch-a、main-integration、main-review-fix；818bdde/9decb4b、b53f3b8/cfdb7f8 |
| B/C 与复审修复 | 保留品牌蓝，提高正文/辅助文字对比；重要 key/status 为14px。桌面紧凑表格和手机重排共用 DOM，导航窄屏用既有抽屉；320 短屏保留可滚卡区、完整准确状态和末项菜单。 | ui-bc 的 decisions/acceptance、ui-bc-review-fix；ed22b83、4bca2ea、bd9bc5a |
| D 与复审修复 | 七模块主要任务优先，原生 details 按需展开既有创建区并保留折叠草稿。测试先执行、发布先看门禁、工时按角色任务分区、追溯当前选择明显、概览优先真实行动。默认对象完成/发布后仍保持原 A；跨对象草稿/豁免隔离，图返回保持展开和焦点。选择记忆仅同 SPA 会话，不新增业务持久化。 | ui-task-first-d、ui-d-review-fix；5870488、0150901 |
| E 与局部修复 | 甘特真实日期文字和原生输入复用原 alignPlans/setItemPlans；正常无变化不误警告，受依赖约束的 no-op 有事实说明。需求分支用原生 button 与 expanded/controls，隐藏图来源回到 summary。手机甘特96px行容纳两个44px目标，桌面64px，SVG几何与行中心一致。 | ui-accessibility-e、ui-e-feedback-fix、ui-e-gantt-target-fix；5ea5d02、46ed121、0b8b506 |
| F | 四静态语义组保留16原导航，无项目切换器或角色裁剪；用原 kindLabel 显示类型。列表真空/筛选空给既有创建或清筛选，用例空态指向已有库/归档恢复/复制草稿；首页只按真实 dueDate→priority→key，统计原高优先行动前置，零任务成员只读展开。就近保存状态只显示真实草稿、接受、错误与原 retry，无假 pending。 | ui-audit-completion-f 的 plan/decisions/coverage/acceptance；cbd58da |
| F 最后两项 P3 | 原动作接受后回填 store 规范化后的项目名称/简介或用例前置/已加入步骤/套件；不吞未加入 action/expected 或重试后的真实新草稿。统计原五链接添加已有44px与focus样式，文字/routes/search不变，320自然换行。 | ui-f-p3-fix；15d19be |

这些记录随可复建源包保存。历史验收文档中的“待独立”表示当时状态；当前代码的最新结论以本报告和精确独立报告为准，不重写历史证据。

## 验证结果与证据边界

作者最新 15d19be 源码：PM 57/57、auth/app-data 55/55、typecheck、三个变更文件 lint（0 error/1 既有 Stats Fast Refresh warning）、auth-off `build:dev` 和 live auth invariant 通过。真实本机 Chromium 定点 red 为3组反例，green为10组、page_errors=[]；设置/用例320/390/1440，统计320/390/768/1440，保留24图。五链接20次正常 pointer 点击与Back，各宽原生Tab至首链接、Enter/Back；所有目标高44px、宽至少80px，无页面横溢出。40普通/hover样本最低5.777775。Python Playwright实际1.58.0、Chromium145.0.7632.6，环境误记已在15d文档纠正。

最新独立复审重新运行 PM57、auth55、typecheck、三文件lint、开发build和live auth检查；核全304源包载荷与230跟踪文件的字节/SHA/Git blob/mode、commit/唯一父/tree、bundle verify/fsck及父补丁重建同一tree。真实 TSX/store 的同步 hook/Storage 边界模型32组预期结果包括29控制、2父红/新绿和1继承行为记录；覆盖Quota/Security失败、读取异常、原重试、新草稿、未加入输入、拒绝/重复保存与关闭重开。该模型不模拟浏览器布局、React并发、native焦点或真实磁盘。独立AST/CSS核原路由与44px/2px，图像为作者图证人工复查，不能称独立浏览器重放。

完整 A/B/C/D/E/F 浏览器矩阵按各自精确候选和验收报告理解，不相加包装成最后提交全站新验收。F作者曾重跑D13、E31+10等保持性检查；其余未改模块引用父和相同源码。新报告的31个载荷已于本轮正式取回逐字节验证，结论为精确15d的限定delta scoped noMajor。

全仓历史 lint 仍为1 error/8 warnings，错误是未改 `src/lib/app-data/client.server.ts:281` 的 no-empty。aggregate 首段195中187通过、8个缺 `.grok`/app-env fixture 失败，后续 `&&` 阶段未执行；PM/auth另行通过，不能称aggregate全绿。本次仅文档收口，没有重跑或顺带修复这些项，也没有执行包含 db:migrate 的普通 build。

## 未做项和下一步边界

- 从零创建 TestCase 和直接 DRAFT→ACTIVE 的 UI 未实现。原 updateCase 已支持 status、归档恢复可变 ACTIVE，不能误说底层没有启用动作；创建套件不等于创建用例。
- 未实现完整逐区加载/权限/错误恢复体系、通用跨路由/刷新草稿保护、全站逐字段保存历史或服务端保存；局部草稿/错误反馈不代表这些能力已交付。
- 原 setItemPlans 不具备完整取消/冻结排程守卫，本轮没有改变其合同，不能宣称新增全面冻结保护。权限、审批、状态机与持久化仍按既有合同。
- Safari/Firefox、实体触屏、IME/物理输入法、辅助技术、生产鉴权和完整 React 并发/输入时序未验收。独立云浏览器此前被阻断，本轮不绕过或宣称独立浏览器通过；E的live resize仍无独立真实浏览器补证。统计其余四链接未逐个单独键盘重放，颜色采样不能外推全站WCAG。
- 主 Vue 规划/实施与 planned 能力明确暂停。F16/F17只是约束记录；React入口不证明Vue成熟度，不开始跨仓工作。

当前本范围无需新增源码修复。下一步留在 hc-project-manage-ui，由用户选择上述未做项中的具体范围或独立补验设备；不自行扩大F，不开始主Vue重构或任何发布动作。

## 可复建交付和独立批准

[已批准源包](https://chatgpt.com/api/library/files/libfile_4975e1d2cdbc81919c06d5b6f39ace36/download)：Library `libfile_4975e1d2cdbc81919c06d5b6f39ace36` v0；`hc-ui-f-p3-15d19be-review.zip`，3287546 bytes；SHA256 `ec6fcb79b137de6e9a1ec22c4fca3eb2d2c0146b9fd8a40445ee3204572031ff`。完整230跟踪文件、完整Git bundle、精确父binary patch、304载荷、24图与实际脚本/命令/失败日志。已官方回读校验，并实际验证bundle checkout和父+patch两种离线复原。详细F的97图等历史证据保留在[原F作者包](https://chatgpt.com/api/library/files/libfile_9bf6e5e12ff88191a06c81adb2887b0d/download) v0；本次不重封历史。

[最新独立复审](https://chatgpt.com/api/library/files/libfile_668fa113691481919b9f08f48f3b5ab8/download)：Library `libfile_668fa113691481919b9f08f48f3b5ab8` v0；`hc-ui-15d19be-independent-recheck.zip`，191013 bytes；SHA256 `a0f4d576d92e75e4764b890202d693a1f727d5bee44a3b0c5448ef818e249533`。本轮通过当前官方Library流程取回，文件存在、外层SHA和31载荷均验证，原README及save-state说明已读。其父F的[精确报告](https://chatgpt.com/api/library/files/libfile_56377dec6384819186e262ad0320050c/download) v0 保留。

消费者在本机需要字节时使用当前官方Library技能prepare_materialize/helper，核文件存在及上述SHA，再运行源包verify_package.py；不能只依赖本机目录或猜下载URL。bundle与补丁离线恢复步骤在源包README；依赖未打包，复验使用仓库开发命令。

本报告沿用仓库reports目录、只新增文档。优先更新现有 Mac 最终报告的官方取回流程失败：当前官方 library_download.py 补齐官方 companion 后仍返回“Library prepare_materialize is not available”。未用另一路read/prepare绕过该目标，旧Library报告 `libfile_9010fdb38d1c8191bac3c29e03ec7a67` v3保持原样；本报告作为UI交付补记另存。故“更新旧最终报告身份”尚未完成，源码交付及独立批准不受影响。
