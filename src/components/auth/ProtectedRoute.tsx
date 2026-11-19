import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const { user, initialized, loading, restoreSession } = useAuthStore();

  useEffect(() => {
    if (!initialized) {
      void restoreSession();
    }
  }, [initialized, restoreSession]);

  if (!initialized || (loading && !user)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC] text-xs text-[#475569] dark:bg-[#111318] dark:text-[#9299A7]">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
