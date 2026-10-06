# p5-workflow-designer 实施交付

工作目录：`hidden_files/work/ui-p5`，分支 `phase-5/admin`。按已批准 spec §7 的 8 步顺序实施，所有实现和测试留在该 worktree；未 commit、未 push。未新增依赖、后端端点或图设计业务请求。

## 改动文件清单

新增：

- `src/lib/workflow-designer.ts`
- `src/lib/workflow-designer-storage.ts`
- `src/lib/__tests__/workflow-designer.test.ts`
- `src/lib/__tests__/workflow-designer-storage.test.ts`
- `src/components/pm/workflow-designer/workflow-designer-page.tsx`
- `src/components/pm/workflow-designer/workflow-state-panel.tsx`
- `src/components/pm/workflow-designer/workflow-canvas.tsx`
- `src/components/pm/workflow-designer/workflow-property-panel.tsx`
- `src/components/pm/workflow-designer/workflow-toolbar.tsx`
- `src/components/pm/__tests__/workflow-designer.test.tsx`
- `src/components/pm/__tests__/workflow-designer-session.test.tsx`
- `src/routes/sys/workflow-designer.tsx`
- `scripts/workflow-designer.browser.mjs`
- `docs/implementation/p5-workflow-designer.md`

修改：

- `src/lib/access/route-manifest.ts`
- `src/lib/access/__tests__/route-manifest.test.ts`
- `src/lib/access/__tests__/access-route.test.tsx`
- `src/routeTree.gen.ts`（由 TanStack Vite 插件生成，未手工编辑）

## 每步验证结果

| 步骤                   | 已实施行为                                                                                                       | 验证结果                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. 类型与 model 纯函数 | v1 类型、原子更新、删除级联、连线约束、全部错误收集、草稿合并与结构快照比较                                      | model 4 项单元测试通过；空图、未连通图、环/反向边、非法引用、稳定 ID、字段长度/坐标与输入不可变均覆盖                  |
| 2. 三栏与画布渲染      | 状态列表、SVG 节点/边/箭头/完整可访问名称、显式选中提示、属性空态                                                | 3 项渲染测试通过；空图、双向边、长标签、RequiredMark/FieldError 及远距离适应内容覆盖                                   |
| 3. 画布交互            | 可见区域中心添加、单选、Pointer Events 预览/一次提交、逆 CTM 坐标换算、选点连线、缩放/平移、键盘入口             | 组件状态流转中的连线/重复/自连/删除级联验证通过；真实拖动、pointer capture、pointercancel/Esc 仍待可运行浏览器环境验证 |
| 4. 属性表单            | 受控草稿、X/Y 拖动替代、全部字段错误、编辑清自身错误、应用/取消/切换确认、不覆盖最新位置                         | 渲染与会话测试通过；无效草稿 dirty、改回干净、坐标合并、确认取消/舍弃均覆盖                                            |
| 5. 工具栏与确认        | 仅已实现操作、AppModal 删除/清空/舍弃确认、取消/X/遮罩/Esc 视为取消、交互冲突禁用                                | 会话测试覆盖确认取消零修改、删除级联、清空、属性校验阻止提交；HeroUI 真实关闭行为仍待浏览器验证                        |
| 6. JSON 与本地持久化   | 严格 v1、UTF-8/1 MiB/200 节点/500 边、用户 key 隔离、显式保存、损坏记录保留、下载 URL 释放、导入会话锁与失效检查 | 存储 5 项单元测试及会话中的失败/取消/重复/过期读测试通过；真实下载/上传/刷新恢复仍待浏览器验证                         |
| 7. 路由与离开守卫      | `/sys/workflow-designer`、旧菜单 alias、AppShell、单一 `useUnsavedChangesGuard(dirty)`，局部确认不调用 markClean | manifest/路由守卫 29 项测试通过，包括未登录、无权限、管理员与普通 alias 菜单夹具；浏览器后退/beforeunload 仍待专项验收 |
| 8. 交付验收            | 跨组件会话测试、8 组 Playwright 专项、文件清单与范围核对                                                         | 6 个测试文件共 48 项通过；脚本语法及 diff 空白检查通过；全仓 typecheck/build 和浏览器专项的限制见下文                  |

## 自检命令与实际限制

```sh
pnpm exec vitest run src/lib/__tests__/workflow-designer.test.ts src/lib/__tests__/workflow-designer-storage.test.ts src/components/pm/__tests__/workflow-designer.test.tsx src/components/pm/__tests__/workflow-designer-session.test.tsx src/lib/access/__tests__/route-manifest.test.ts src/lib/access/__tests__/access-route.test.tsx
pnpm typecheck
pnpm build:dev
node --check scripts/workflow-designer.browser.mjs
P5_BROWSER_BASE_URL=http://127.0.0.1:8095 node scripts/workflow-designer.browser.mjs
```

- Vitest：6 个文件、48 项测试通过。会话 harness 复用现有 node 测试约定，只验证状态流转；不能替代真实 DOM/拖动验证。
- `pnpm typecheck`：exit 2，共 22 条既有诊断，涉及未改动的 `src/components/biz/{child-issue-list,create-issue-dialog,issue-dialog}.tsx`、`src/components/pm/{issue-page,navigation-focus,shell}.tsx`、`src/components/pm/use-go-item.ts`、`src/lib/pm/navigation.ts`、`src/routes/{login,projects}.tsx`。原因是 `@tanstack/history` 类型增补及 HeroUI v2 API 残留；本次改动文件没有诊断。没有扩大范围修复这些文件。
- `pnpm build:dev`：exit 1，两个 MISSING_EXPORT 错误，均为未改动的 login/projects 页面从 HeroUI v3 导入 `CardBody`。
- 开发服务实际尝试 `pnpm exec vite dev --host 127.0.0.1 --port 8095`，监听被沙箱以 `EPERM` 拒绝。路由生成在监听失败前已完成。
- Playwright 实际尝试上述地址，Chromium 启动报 `sandbox_host_linux.cc:41 ... Operation not permitted`，8 组测试均未进入场景。该结果是环境阻断，不能宣称浏览器专项通过。脚本已完成 node 语法检查。
- 本地原始日志：`.verification/workflow-designer-{typecheck,build,browser}.log`（Git 忽略）。最终门禁应由 worker 亲自重跑。

## 实施收敛与未决事项

异常恢复说明明确“当前以空图作为干净快照”；覆盖确认仅由损坏/不可读记录触发，正常记录与无记录不会要求确认覆盖。alias 的真实映射及不创建旧 URL 已有测试。外部 spec 未改动，交付表统一使用已实施/验证结果措辞。

剩余验收是可用浏览器环境中的 SVG、HeroUI、文件与导航真实交互，以及运行环境的真实菜单数据/授权联调。普通用户测试权限编码仅存在于夹具，不作为后端契约。图条件仅保存原文；旧 X6 格式、发布和执行语义继续处于本期非目标范围。
