# D 修复作者验收

## 实际结果

在未经修改的 5870488 本机 Chromium 复现三项 P2：两个 RUNNING 默认 A 完成后跳到 B；两个 APPROVED 默认 A 发布后跳到 B 并带入 A 豁免；图节点详情实际挂载后 Back，依赖图收起且焦点 BODY。包内 reproduction.json、脚本和三张 red 图是本机失败证据。

修复后三个源 view 范围内 13 个主控制组加 2 个补充控制组全部通过，pageerrors 为空。验证包括：

- Tests 双 RUNNING 完成 A 保持 A 的失败报告与定向复测，复测 sourceRunId 对应 A；同对象重选保留取消草稿，切 B 清草稿，Cancel 不写业务数据。
- Releases 双 APPROVED 发布 A 后保持 A 快照，B 仍 APPROVED；实际切 B 豁免为空，空豁免仍被原 gate 拒绝；B 另填原因发布，A 快照不变。双 SUBMITTED 的审批意见同对象保留、跨对象清空；切换不写业务。
- 迟到加载、选中对象消失、空列表和同 SPA 项目参数切换恢复真实对象上下文。既有 reset 后旧 remembered ID 不会造成空详情，重挂载仍选真实样例；经既有提交/审批后豁免为空。移除/空列表使用浏览器测试 fixture 的 store.setState，无新增产品删除能力。
- 模拟真实 Storage QuotaExceededError：当前 A 保持发布结果与未保存提示/beforeunload 保护，切 B 草稿为空，恢复存储后重试成功。
- 四个真实 seed 图节点均等待 dialog 可见且来源 summary 已卸载，再 Back/Close；首次 Forward 后再次实际挂载与 Back 焦点恢复。Escape/Close/Back/Forward-Back 在 320×568 返回可见原节点，捕获/返回 scrollLeft 均为 518。列表返回保留原来源焦点；显式收起与更新导航/项目切换仍保持收起。
- 三模块四宽默认截图 12 张、展开图四宽 4 张，以及 7 张状态/焦点图；四宽 documentElement 无横向溢出。抽检 320 测试默认、390 发布默认、1440 展开图和320横向返回焦点；其他图保留供复审。此次不改 palette、共享菜单或布局合同，未宣称完整 WCAG 审计。

## 命令与退出码

| 实际命令 | 退出码/结果 |
| --- | --- |
| npm run test:pm | 0，57/57 |
| node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts | 0，55/55 |
| npm run typecheck | 0 |
| ./node_modules/.bin/eslint src/components/pm/tests-view.tsx src/components/pm/releases-view.tsx src/components/pm/dependencies-view.tsx | 0 |
| git diff --check | 0 |
| VITE_AUTH_ENABLED=false npm run build:dev | 0；已有 HeroUI use-client 等依赖警告 |
| VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183 | 0，dev/build sign-in off 一致 |
| python3 reproduce.py（原样父候选） | 0，三项 reproduced=true |
| python3 verify.py（修复候选） | 0，JSON 13/13 pass，pageerrors=[] |
| python3 supplemental.py（修复候选） | 0，2/2 pass，pageerrors=[] |
| npm run lint | 1；原有 client.server.ts:281 no-empty，合计1 error/8 warnings |
| npm test | 1；首段195测试187通过8失败，缺 .grok skill/app-env fixtures，后续段未运行；相关两组单独57/55通过 |

首次 sandbox 开发构建因共享 node_modules/.vite-temp 写入 EPERM 失败；授权本地权限后成功，不安装依赖或改现有服务。首次认证检查因本地网络观测返回2；随后未设置 auth-off 的检查返回1（与本任务显式 auth-off 服务不同）；最终用同一环境返回0。初轮浏览器脚本有非法测试 fixture 回退、精确 accessible name、挂载瞬间计数和误判样例状态等测试断言问题，修正后再运行最终主/补充结果；保留 harness-errors JSON，不能把早期失败算产品通过。没有自动审批拒绝，也没有远端写入。

## 原证据边界与待复审

原 D 验收的部分来源导航检查只等待 URL，尚未等待详情真正挂载，漏过图折叠回归。本报告明确更正该证据边界，不修改/覆盖冻结 D 报告或 Library v0。新验证在实际卸载/重挂载边界上执行；原截图也不应被当作双对象缺陷的否定证明。

此为作者局部修复验证，独立 noMajor 仍待对精确新提交复审。全仓 lint 与缺 fixture 测试保持原失败；本次未扩展为其他模块完整重审，也未覆盖所有 WCAG/设备。原 D 工作树保持 clean/5870488，新候选仅本地 commit 后交付可离线 clone 的 bundle、完整 patch、manifest、关键图证/命令日志和独立报告原包，通过官方 Library 保存/回读核验。停止4183，E与所有远端动作不执行。
