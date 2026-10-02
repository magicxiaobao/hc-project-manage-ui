# main+A 独立复审三项 P2 修复

冻结输入 `b53f3b8a4179ecf3999179f7e27c63f2cfa79e1d` 保留不变。独立分支 `codex/ui-main-review-fix-20261002`，worktree `/Users/a1234/Documents/Codex/2026-10-02/task-2/ui-main-review-fix-worktree`。最初只准备 clone，随后独立复审最终收口三项 P2，授权集中最小修复、验证和本地提交。无 P0/P1 结论来自该冻结输入的独立复审；不等于修复后已获新一轮独立批准。B/C、push、PR、部署、主 Vue 均不在本轮范围。

## Files 与问题来源

- `src/lib/pm/store.ts`：继承 main 的 cloneItem 保留锁定版本归属会扩大实时范围。FROZEN/RELEASED/DEPRECATED 的新副本 versionId=null，可编辑版本保持合同，原项、版本和发布快照不变。
- `src/lib/pm/store.test.ts`：三种锁定版本 × 三类事项；初始状态、内容、独立 id/key、范围与快照不变；三种可编辑版本与未分配/缺失项控制。
- `src/components/pm/issue-page.tsx`：继承精确 A9decb 的慢返回双 Close 与 Close→Forward 后关闭失效。用渲染 match + resolvedLocation 绑定详情历史身份；当来源或较新详情 pending，旧回调不得消费全局新 location。onResolved 清除在途关闭 latch，支持中断后再次关闭。保留即时重复关闭防重；无产品 timeout/sleep。
- `src/components/pm/navigation-focus.tsx`、`use-go-item.ts`、`src/lib/pm/navigation.ts` 与测试：整合 main 行内状态 select 和 A 焦点恢复的兼容缺口。增加实际 SELECT 候选/捕获/校验，保留稳定 key/label 机制与 heading 回退，不泛化任意 DOM。
- 本计划和 `acceptance.md`。所有浏览器脚本、截图、复审原件、传输凭据、验证日志放 worktree 外 `ui-main-review-fix-evidence`，不入 Git。

## 方法和约束

先在未修导航/焦点与未修 store 上复现，再最小修复。Mac 真实 Chromium 使用已安装 Playwright 和缓存浏览器，端口4183；不会安装新软件、修改安全设置或动8089/4179、Docker、MySQL。来源 beforeLoad 的可手动释放 Promise 与测试 pendingMs 仅浏览器回放 fixture，用来保持旧详情渲染；它们不写产品代码。断言基于真实 router 状态/DOM/可访问控件，没有固定 sleep 作为通过依据。克隆 fixture 通过只暴露组件实际 store 实例的响应注入设置版本状态，避免开发 HMR 造成模块实例偏差。

保留原完整证据和通过结论，本轮新证据单独记录。PM、auth、type、变更 lint、devbuild 与真实 UI 定点复测；全量 lint/aggregate 的基线失败保持如实报告，不因单测通过宣称浏览器通过。验证完成后本地冻结提交，仍不推送。
