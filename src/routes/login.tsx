import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiBusinessError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/api/auth-store';

export const Route = createFileRoute('/login')({ component: LoginPage });

/**
 * Phase 0 登录页：调用真实后端 /auth/v1/login。
 * 成功后进 /projects；已登录直接跳转。
 */
function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, login, hydrate } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: '/projects' });
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
      void navigate({ to: '/projects' });
    } catch (err) {
      setError(err instanceof ApiBusinessError ? err.message : '登录失败，请检查网络后重试');
    } finally {
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
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 px-2 pb-4">
            <Input
              label="用户名"
              value={username}
              onValueChange={setUsername}
              isRequired
              autoComplete="username"
            />
            <Input
              label="密码"
              type="password"
              value={password}
              onValueChange={setPassword}
              isRequired
              autoComplete="current-password"
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button color="primary" type="submit" isLoading={loading}>
              登录
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
