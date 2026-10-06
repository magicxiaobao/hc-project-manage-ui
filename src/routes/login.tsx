import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { Button, Card, CardContent, CardHeader, Input, Label, TextField } from '@heroui/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiBusinessError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/api/auth-store';
import { resolvePostLoginTarget } from '@/lib/auth/login-redirect';

export const Route = createFileRoute('/login')({
  // r6 P1 修复（run159-codex-pi-P5-r6-1）：路由守卫被拦截时把原目标地址
  // 放进 `redirect` 参数，登录成功后按此跳回（缺省回 /projects）。
  // 键缺省时不返回：search 参数整体可选，不破坏既有 navigate({ to: "/login" })。
  validateSearch: (search: Record<string, unknown>) => {
    const redirect = resolvePostLoginTarget(search.redirect);
    return redirect === undefined ? {} : { redirect };
  },
  component: LoginPage,
});

/**
 * Phase 0 登录页：调用真实后端 /auth/v1/login。
 * 成功后进 `redirect` 参数指定的原目标地址（路由守卫携带），缺省 /projects；
 * 已登录直接跳转。
 */
function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  const { isAuthenticated, login, hydrate } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 同步防重入：loading 是 state，快速连点/连按 Enter 时两次提交可能都看到 loading=false；
  // 用 ref 做同步门控，保证只有最新一次提交的响应能落盘凭证并跳转（见 auth-store login 的后写者胜）。
  const submittingRef = useRef(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 登录后去向：守卫携带的原目标地址优先（router.navigate({ href })
  // 接受任意内部路径字符串，不受 navigate 的路由字面量类型约束；同地址
  // 提交会被 router 去重（commitLocation 的 isSameLocation 分支只 load
  // 不推进 history），缺省回 /projects。
  const goAfterLogin = () => {
    if (redirectTo) {
      void router.navigate({ href: redirectTo });
    } else {
      void navigate({ to: '/projects' });
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      goAfterLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, redirectTo]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
      goAfterLogin();
    } catch (err) {
      setError(err instanceof ApiBusinessError ? err.message : '登录失败，请检查网络后重试');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-col items-start gap-1 px-6 pt-6">
          <h1 className="text-xl font-semibold">登录</h1>
          <p className="text-sm text-default-500">连接 hc-project-manage 后端</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 px-2 pb-4">
            <TextField
              value={username}
              onChange={setUsername}
              isRequired
              aria-label="用户名（必填）"
            >
              <Label>用户名</Label>
              <Input autoComplete="username" />
            </TextField>
            <TextField
              value={password}
              onChange={setPassword}
              isRequired
              aria-label="密码（必填）"
            >
              <Label>密码</Label>
              <Input type="password" autoComplete="current-password" />
            </TextField>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button variant="primary" type="submit" isDisabled={loading}>
              {loading ? '登录中…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
