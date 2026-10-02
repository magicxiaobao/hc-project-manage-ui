# F 设计与技术决定

1. 导航为四个静态语义组，保留16个原链接、params、active判断和抽屉合同。导航仍内部滚动，无新折叠状态、项目切换器或角色过滤。组标题使用h2，浏览器断言因此明确定位main内任务标题，未删掉正确的标题语义。
2. 类型文字复用kindLabel，放在卡片元信息及行/表格编号附近，无新列、新枚举或状态映射。长真实taskType可换行，key/准确状态仍可读；标题保留既有两行/详情入口。样本长key为HC-12345678，未声称任意无限长度输入布局通过。
3. PersistenceStatus是纯展示组件，只接收ready/error、草稿/本次实际接受事实及原retry回调。同步本机存储没有“保存中”，故不制造pending、计时器、事件总线或新通知。错误优先且不得显示已保存；详情只说明即时保存模式，不由error=null冒认某次业务提交成功。列表仅在当前实际编辑行反馈，若原筛选导致该行消失，全局错误保护仍在；没有新增全站逐字段追踪。
4. 设置与用例草稿直接比较当前本地字段和真实对象。成功后再改字段会回到草稿；未加一步的输入也算未提交，原保存只写已加入步骤，反馈准确说明。可选precondition/steps用原空值语义归一，避免 untouched 无步骤用例误标草稿。既有未提交表单不新增跨导航/刷新持久化或通用dirty guard。
5. 初轮真实打开CaseDetail发生Maximum update depth exceeded：原usePm selector使用filter/map每次创建新数组。白名单tests-view内改为先订阅原items/suites稳定引用，再在视图中筛选；不修改store动作或数组内容。最终真实详情保存/复制/恢复/关闭链验证。初轮失败日志保留。
6. 列表区分项目真空与筛选空。清空既有query/kind/mine/hideDone，保留sort/ascending及既有合法URL来源；真空使用原createOpen入口。用例零ACTIVE提示展开现有库、恢复ARCHIVED或复制草稿。没有createCase从零UI/action或DRAFT/REVIEW启用入口，明确保留业务能力缺口，不把创建套件称为新用例。
7. 工作台只按已有dueDate升序、已有priority和key稳定排，无日期排后；不从计划/迭代推断deadline。统计把原urgent真实行动区放前，五入口复用既有路线，未完成/全部两入口准确携带issues现有筛选；原aggregate公式和完成历史不变。任务分配把zero成员集中只读details，原分配候选包含所有成员，原点数/工时公式不变。
8. 未使用可选styles文件。13个源文件在批准最多14个内；package/lock、路由定义、导航来源算法、domain/store/schedule/persistence、认证/权限/审批/冻结均不改。主Vue/planned无改动；原setItemPlans没有全面取消/冻结排期禁写，本批不声称建立该保护。
9. 只执行本地命令、开发服务、开发构建和本地提交；不push/PR/merge/deploy/远端修复。原D/D-fix/E/46ed/0b候选冻结。普通build含db:migrate，不执行。
10. 测试辅助脚本失败保持原日志：inspect名称曾与Python标准库重名；复制用例实际在数组首部而非尾部；新导航h2导致旧未限定main标题断言不适用；原生Storage函数作为evaluate返回值触发Illegal invocation；恢复夹具首次错误包含UI字段，原decoder拒绝，改用实际persisted PmData。均修正验收目标/夹具，未弱化业务检查。辅助ps查询被沙盒拒绝（operation not permitted）；未提权或改法查询进程，服务身份和停止仅使用已允许的PTY/lsof。

补充验收事实：既有autocomplete应点击完整可见触发区，内部指示器按钮在320测量为0宽（共享菜单源未改）；完整触发区正常click、末项滚动与真实Tab/Enter/End/Escape均通过。选项可访问名称含头像短名与全名，脚本按真实名称定位。暂停需要原因、HC142有未完成FS前置，故验收先准确断言原拒绝，再以HC151验证合法流转；原seed没有取消项，使用原transition带真实原因准备隔离取消fixture，避免不存在键的空断言。
