# p5-dictionary 实施报告（2026-10-05）

工作目录：`work/ui-p5`；分支：`phase-5/admin`。按已批准的 `specs/p5-p5-dictionary.md` 实施，并优先落实用户提供的 NOTE-1 收敛。未修改后端、旧前端、依赖或共享 AppModal/form-guard；未执行 git add/commit。

## 文件清单

新增实现：

- `src/routes/sys/dictionaries.tsx`：AppShell + Outlet 布局。
- `src/routes/sys/dictionaries/index.tsx`：列表路由入口。
- `src/components/pm/dictionary-list-live.tsx`：服务端筛选/分页、数字状态操作、当前页批量及显式单项 hash 读取/校验。
- `src/components/pm/dictionary-form-dialog.tsx`：字典新建/编辑、编码只读编辑、独立 dirty 守卫、字段错误和异步会话隔离。
- `src/components/pm/dictionary-items-dialog.tsx`：固定 dictId 的大型管理弹窗，父关闭转发至子退出守卫。
- `src/components/pm/dictionary-item-form-dialog.tsx`：项新建/编辑、所属上下文双匹配、JSON/Integer 校验及独立 dirty 守卫。
- `src/lib/dictionary-form.ts`：字典字段校验、原始快照及 DC/DU 白名单。
- `src/lib/dictionary-item-form.ts`：项字段校验、原始快照及 IC/IU 白名单。
- `src/lib/dictionary-query.ts`：条件规范化、分页包装、数字状态和安全 ID 判定。
- `src/lib/dictionary-options.ts`：有效字典到 code 选项的纯映射及 code→源记录 Map。
- `src/lib/dictionary-hash.ts`：当前页批次映射、逐 code 结果文案及会话匹配判定。
- `src/lib/query/hooks/useDictionaries.ts`：字典读写/预检/hash hooks 与共享有效字典出口。
- `src/lib/query/hooks/useDictionaryItems.ts`：项列表/详情/读写/预检 hooks。

新增测试：

- `src/components/pm/__tests__/dictionary-forms.test.tsx`
- `src/components/pm/__tests__/dictionary-hook-harness.tsx`
- `src/components/pm/__tests__/dictionary-items.test.tsx`
- `src/components/pm/__tests__/dictionary-list.test.tsx`
- `src/components/pm/__tests__/dictionary-route.test.tsx`
- `src/lib/__tests__/dictionary-form.test.ts`
- `src/lib/__tests__/dictionary-hash.test.ts`
- `src/lib/__tests__/dictionary-item-form.test.ts`
- `src/lib/__tests__/dictionary-options.test.ts`
- `src/lib/__tests__/dictionary-query.test.ts`
- `src/lib/query/__tests__/dictionaries.test.tsx`
- `src/lib/query/__tests__/dictionary-items.test.tsx`

新增报告：`docs/implementation/p5-dictionary.md`（本文）。

修改文件：

- `src/lib/access/__tests__/access-route.test.tsx`
- `src/lib/access/__tests__/route-manifest.test.ts`
- `src/lib/access/__tests__/snapshot.test.ts`
- `src/lib/access/route-manifest.ts`
- `src/lib/api/__tests__/system-contract.test.ts`
- `src/lib/query/index.ts`
- `src/lib/query/keys.ts`
- `src/routeTree.gen.ts`

`system.ts` / `system-types.ts` 实读核对后原样复用；没有新增 API 包装。routeTree 由现有 Vite/TanStack 工具自动生成，没有手改。

## spec §7 逐项核对

| 步骤 | 实施与验证状态 |
| --- | --- |
| 1 固定 API 契约 | 完成。契约测试独立覆盖字典 13、字典项 11 方法的最终 URL、动词、body/query；GET 特殊字符编码、POST 无体启停、分页 DTO、Boolean、0 ID、业务/403/网络错误、缺批量结果 key 与无删除方法。 |
| 2 纯模型 | 完成。多字段错误一起收集，原始文本 dirty（空格/JSON 排版/还原），数字状态严格判定，Integer 边界及 JSON 对象，清空语义与请求白名单。 |
| 3 查询/共享出口 | 完成。六个 kind 全走 system.list；权限 enabled 与 mutation 重查，ID 校验和 itemId+dictId 双匹配；有效字典共享请求，accessible 状态与加载/错误保留；写成功失效 system.all，预检/hash 只读不失效。 |
| 4 列表/表单/路由 | 完成。`/sys/dictionaries` 注册为 menu，alias `/system/dictionary`；未知页样本迁至 `/sys/system-configs`，补新页授权/拒绝断言；保留 sys 动态 guardAccess。字典表单必填/错误/草稿/会话/成功关闭均有目标测试。 |
| 5 项管理/hash UI | 完成。findByDictId 含禁用项，父子上下文保留；父 Modal 关闭/返回统一转发子 guard，预检+保存统一 busy；项唯一性/JSON/排序/name 空值覆盖。hash 匹配、不匹配、缺 key、错误分别呈现；切页/重取/写后撤销旧会话，重取失败也不会恢复旧校验结果。 |
| 6 集成/真实验收 | 前端自检完成（结果见下）；§6.4 真实后端/浏览器联调 **BLOCKED / 未做**，交由 worker 后续完成，不宣称全项验收通过。 |

## 自检结果

所有命令在 `work/ui-p5` 执行，使用 pnpm。以下计数以最后一次完整运行结果为准。

| 命令 | 结果 | 输出行数 |
| --- | --- | --- |
| `pnpm typecheck` | exit 2；基线 22 个错误、最终同样 22 个，逐条诊断集合一致，**新增 0 / 改动文件错误 0**；不能声称全仓 typecheck 全绿。 | 基线 51 行、最终 51 行 |
| `pnpm test:contract` | exit 0；**2 个文件 / 135 tests passed**。system-contract 单文件 82 项；其中新增全量字典组 30 项，24 方法各有独立 URL/动词/body/query 断言。 | 15 行 |
| 下列目标 Vitest 命令 | exit 0；**15 个文件 / 158 tests passed**，含 session 与相关 access 目标测试。 | 25 行 |
| `git diff --check` | exit 0；无空白错误。 | 0 行 |
| `pnpm dev` | 路由生成完成；监听端口被沙箱拒绝，exit 1（EPERM），不计为浏览器验证通过。 | 17 行 |

最终通过计数合计 17 个测试文件、293 项断言（契约 135 + 目标 158）。

22 个既有错误来源：

- `src/components/biz/child-issue-list.tsx`：1 条。
- `src/components/biz/create-issue-dialog.tsx`：1 条。
- `src/components/biz/issue-dialog.tsx`：3 条。
- `src/components/pm/issue-page.tsx`：3 条。
- `src/components/pm/navigation-focus.tsx`：1 条。
- `src/components/pm/shell.tsx`：1 条。
- `src/components/pm/use-go-item.ts`：2 条。
- `src/lib/pm/navigation.ts`：1 条。
- `src/routes/login.tsx`：4 条。
- `src/routes/projects.tsx`：5 条。

目标测试完整命令：

```sh
pnpm exec vitest run \
  src/lib/__tests__/dictionary-form.test.ts \
  src/lib/__tests__/dictionary-item-form.test.ts \
  src/lib/__tests__/dictionary-query.test.ts \
  src/lib/__tests__/dictionary-options.test.ts \
  src/lib/__tests__/dictionary-hash.test.ts \
  src/lib/query/__tests__/dictionaries.test.tsx \
  src/lib/query/__tests__/dictionary-items.test.tsx \
  src/lib/query/__tests__/session.test.ts \
  src/components/pm/__tests__/dictionary-list.test.tsx \
  src/components/pm/__tests__/dictionary-items.test.tsx \
  src/components/pm/__tests__/dictionary-forms.test.tsx \
  src/components/pm/__tests__/dictionary-route.test.tsx \
  src/lib/access/__tests__/route-manifest.test.ts \
  src/lib/access/__tests__/snapshot.test.ts \
  src/lib/access/__tests__/access-route.test.tsx
```

组件测试沿用 Vitest node：真实组件静态渲染 + 受控 hooks/回调。`dictionary-hook-harness.tsx` 用于调用真实表单/列表回调及推进状态/effect，不模拟 DOM、真实路由历史或浏览器事件。它证明退出入口调用 guard、父关闭转发、会话和字段快照隔离，不能证明浏览器实际触发 Escape、后退或 beforeunload。

## NOTE-1 与后端依据

`buildDictionaryItemCreatePayload` 的可编辑字段白名单始终包含 `name: form.name`，默认空字符串；空 name 不省略、不发 null。编辑清空 name 同样发送 `""`。纯模型和组件提交测试均断言该行为。name 仍为可选用户字段，用户填写的非空显示文本原样发送。

理由：只读 SQL 证据为 `pm_dictionary_item.name VARCHAR(100) NOT NULL`；MyBatis-Plus NOT_NULL 插入策略会漏掉 null 列。采用 coordinator 已批准的收敛，覆盖 spec §5.3 对新建空 name 可省略的可选理解。

后端事实忠实保留：分页只发 page/pageSize/bean（code/title），未添加 keyword/pageNum/sorts，未全量本地分页；validStatus 严格以数字 1/0 判定。字典更新不发 code/hash/status；项创建/更新不引入响应字段。value 始终 String，不按父 valueType 转换；ID 为正的安全整数，创建 0 ID 抛失败。前端不生成或写 hash，不将其当 CAS。

## 未覆盖/偏离与依赖

- **§6.4 BLOCKED / 未做**：无运行后端；创建/更新/启停回读、分页筛选 total/实际匹配、真实 403/登录失效、Long 序列化/时间单位及 hash 新鲜度均待联调。
- `DictionaryServiceImpl.java:105–110` 创建空 wrapper，未读取 bean 条件；前端如实发送 code/title，并提示实际效果待联调，未伪造筛选已通过。
- `DictionaryItemServiceImpl.java:222` 父 hash 更新误用 `selectById(dictId)` 查字典项，可能更新错误父字典或未更新；只记录，未修改后端/补偿 hash。
- `DictionaryController.java:199–207` 批量校验未捕获单项异常；前端显示整批请求错误，不把异常降为 false，允许重取数据后重试。
- `pnpm dev` 自动生成路由文件后启动失败：沙箱 `listen EPERM 0.0.0.0:8080`。未绕过限制；真实鼠标、X/遮罩/Escape、浏览器后退/路由导航、刷新/关标签的原生确认仍需 worker 浏览器测试。
- 列表时间展示原始 Long 并标注原始值，待联调确认单位，未假造 createTime/updateTime 或毫秒日期。
- NOTE-1 是唯一请求载荷收敛；其余实现无有意偏离 spec。代码评审/commit/push 留给 worker 后续门禁，本轮没有执行。
