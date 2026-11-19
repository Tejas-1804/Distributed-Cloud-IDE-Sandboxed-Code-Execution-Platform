import { Cloud, Lock, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, initialized, restoreSession, login, loading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: string } | null)?.from || '/';

  useEffect(() => {
    if (!initialized) {
      void restoreSession();
    }
  }, [initialized, restoreSession]);

  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      await login({ email, password });
      toast.success('Signed in to Cloud IDE');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      setErrorMessage(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 text-[#0F172A] dark:bg-[#111318] dark:text-[#E5E7EB]">
      <div className="w-full max-w-md rounded-lg border border-[#CBD5E1] bg-white p-7 dark:border-[#292E38] dark:bg-[#171A21]">
        <div className="mb-6 flex items-center gap-2.5">
          <Cloud className="h-5 w-5 text-[#4F8CFF]" />
          <span className="text-base font-bold tracking-tight">Cloud IDE</span>
        </div>

        <h1 className="text-xl font-bold tracking-tight">Sign in to your workspace</h1>
        <p className="mt-1 text-xs text-[#475569] dark:text-[#9299A7]">
          Access your persisted cloud workspaces and MongoDB-backed files.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-[#DC2626]/40 bg-[#DC2626]/10 px-3 py-2 text-xs text-[#DC2626] dark:text-[#F87171]"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium">
              Email Address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-[#9299A7]" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@example.com"
                className="w-full rounded-md border border-[#CBD5E1] bg-white py-2 pr-3 pl-9 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-[#9299A7]" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-md border border-[#CBD5E1] bg-white py-2 pr-3 pl-9 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#4F8CFF] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#3B7AE8] disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-5 border-t border-[#E2E8F0] pt-4 text-center text-xs text-[#475569] dark:border-[#292E38] dark:text-[#9299A7]">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-[#4F8CFF] hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
