import { Cloud, Lock, Mail, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';

export function Register() {
  const navigate = useNavigate();
  const { user, initialized, restoreSession, register, loading } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) {
      void restoreSession();
    }
  }, [initialized, restoreSession]);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    try {
      await register({ name, email, password, confirmPassword });
      toast.success('Account created successfully');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setErrorMessage(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4 py-8 text-[#0F172A] dark:bg-[#111318] dark:text-[#E5E7EB]">
      <div className="w-full max-w-md rounded-lg border border-[#CBD5E1] bg-white p-7 dark:border-[#292E38] dark:bg-[#171A21]">
        <div className="mb-6 flex items-center gap-2.5">
          <Cloud className="h-5 w-5 text-[#4F8CFF]" />
          <span className="text-base font-bold tracking-tight">Cloud IDE</span>
        </div>

        <h1 className="text-xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-xs text-[#475569] dark:text-[#9299A7]">
          Set up your developer account to store and manage cloud workspaces.
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
            <label htmlFor="reg-name" className="mb-1.5 block text-xs font-medium">
              Full Name
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-[#9299A7]" />
              <input
                id="reg-name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Developer"
                className="w-full rounded-md border border-[#CBD5E1] bg-white py-2 pr-3 pl-9 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-email" className="mb-1.5 block text-xs font-medium">
              Email Address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-[#9299A7]" />
              <input
                id="reg-email"
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
            <label htmlFor="reg-password" className="mb-1.5 block text-xs font-medium">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-[#9299A7]" />
              <input
                id="reg-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full rounded-md border border-[#CBD5E1] bg-white py-2 pr-3 pl-9 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="reg-confirm" className="mb-1.5 block text-xs font-medium">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B] dark:text-[#9299A7]" />
              <input
                id="reg-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full rounded-md border border-[#CBD5E1] bg-white py-2 pr-3 pl-9 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#4F8CFF] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#3B7AE8] disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 border-t border-[#E2E8F0] pt-4 text-center text-xs text-[#475569] dark:border-[#292E38] dark:text-[#9299A7]">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-[#4F8CFF] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
