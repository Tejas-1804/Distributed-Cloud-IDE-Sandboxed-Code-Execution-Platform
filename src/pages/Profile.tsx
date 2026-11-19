import { ArrowLeft, Cloud, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '../store/useAuthStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export function Profile() {
  const navigate = useNavigate();
  const { user, updateProfile, changePassword, logout, loading } = useAuthStore();
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({ name, email });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    try {
      await changePassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change password.');
    }
  };

  const handleLogout = async () => {
    closeWorkspace();
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] dark:bg-[#111318] dark:text-[#E5E7EB]">
      <header className="border-b border-[#CBD5E1] bg-white dark:border-[#292E38] dark:bg-[#171A21]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-2.5 py-1.5 text-xs font-medium hover:bg-[#F1F5F9] dark:border-[#292E38] dark:hover:bg-[#222631]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cloud className="h-4 w-4 text-[#4F8CFF]" />
              <span>Account Settings</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-1.5 text-xs font-medium text-[#DC2626] hover:bg-[#DC2626]/10 dark:border-[#292E38]"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Log out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {/* Profile Details */}
        <section className="rounded-lg border border-[#CBD5E1] bg-white p-6 dark:border-[#292E38] dark:bg-[#171A21]">
          <h2 className="text-base font-semibold">Profile Details</h2>
          <p className="mt-1 text-xs text-[#475569] dark:text-[#9299A7]">
            Manage your display name and login email address.
          </p>

          <form onSubmit={(e) => void handleSaveProfile(e)} className="mt-5 grid max-w-md gap-4">
            <div>
              <label htmlFor="profile-name" className="mb-1.5 block text-xs font-medium">
                Full Name
              </label>
              <input
                id="profile-name"
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>

            <div>
              <label htmlFor="profile-email" className="mb-1.5 block text-xs font-medium">
                Email Address
              </label>
              <input
                id="profile-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-[#4F8CFF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3B7AE8] disabled:opacity-50"
              >
                Save Profile
              </button>
            </div>
          </form>
        </section>

        {/* Change Password */}
        <section className="rounded-lg border border-[#CBD5E1] bg-white p-6 dark:border-[#292E38] dark:bg-[#171A21]">
          <h2 className="text-base font-semibold">Change Password</h2>
          <p className="mt-1 text-xs text-[#475569] dark:text-[#9299A7]">
            Update your password and rotate your active refresh session.
          </p>

          <form onSubmit={(e) => void handleChangePassword(e)} className="mt-5 grid max-w-md gap-4">
            <div>
              <label htmlFor="cur-pass" className="mb-1.5 block text-xs font-medium">
                Current Password
              </label>
              <input
                id="cur-pass"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>

            <div>
              <label htmlFor="new-pass" className="mb-1.5 block text-xs font-medium">
                New Password
              </label>
              <input
                id="new-pass"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>

            <div>
              <label htmlFor="confirm-new-pass" className="mb-1.5 block text-xs font-medium">
                Confirm New Password
              </label>
              <input
                id="confirm-new-pass"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm focus:border-[#4F8CFF] focus:outline-none dark:border-[#292E38] dark:bg-[#111318]"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-[#4F8CFF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3B7AE8] disabled:opacity-50"
              >
                Update Password
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
