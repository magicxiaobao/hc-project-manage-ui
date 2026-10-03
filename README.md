# 恒川项目协作前端

Jira 式看板交互的前端样板。数据在浏览器内存里，状态流转沿用恒川需求、任务、缺陷的状态机。

```bash
npm install
npm run dev
```

打开看板 `/p/HC`。拖拽只接受当前状态允许的下一步。点卡片打开居中事项窗。

## Phase 0：API 客户端基础（分支 `phase-0/api-foundation`）

本阶段接入真实后端（hc-project-manage 的 Spring Boot 服务，默认本机 `127.0.0.1:8089`）：

- `src/lib/api/`：fetch 实现的 HTTP 客户端。行为对标老前端 `frontend/src/utils/request.ts`——
  请求头 `token` 携带令牌、统一解包 `{ code, msg, result }`（`code === 1` 成功）、
  业务码 `10106/10107/10108/10109/10115` 视为登录失效、HTTP 401 自动刷新 token 并重放一次。
- 登录页 `/login`：调用真实 `/auth/v1/login`；登录态经 zustand + localStorage 持久化。
- 项目页 `/projects`：登录后走真实 `/project/v1/findByPage` 渲染；未登录时仍为演示数据。

### 本地联调

```bash
# 1. 在 hc-project-manage 仓库启动后端（监听 127.0.0.1:8089）
# 2. 本仓库：
npm install
npm run dev   # /api 会被反代到 http://127.0.0.1:8089
```

打开 `/login`，用后端账号登录，成功后进入 `/projects` 应看到真实项目列表。

后端地址可通过环境变量覆盖：

```bash
VITE_API_BASE_URL=http://192.168.1.10:8089 npm run dev
```

注意：直接指向后端地址时浏览器会直连，需后端放行 CORS；默认 `/api` + vite 反代无此问题。

### 契约测试

```bash
npm run test:contract
```

断言登录/项目列表接口的请求与响应结构（URL、请求体、信封解包、401 刷新重放）。
契约变更前请先更新测试。
