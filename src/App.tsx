import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { offlineSyncQueue } from './services/offline/offlineSyncQueue';
import { useThemeStore } from './store/useThemeStore';

const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Workspace = lazy(() =>
  import('./pages/Workspace').then((m) => ({ default: m.Workspace })),
);
const Monitoring = lazy(() =>
  import('./pages/Monitoring').then((m) => ({ default: m.Monitoring })),
);

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] text-xs text-[#64748B] dark:bg-[#0f1115] dark:text-[#9299A7]">
      Loading Cloud IDE...
    </div>
  );
}

function AppContent() {
  const theme = useThemeStore((state) => state.theme);
  const location = useLocation();

  useEffect(() => {
    const syncQueuedEdits = async () => {
      if (!navigator.onLine) return;
      const pending = offlineSyncQueue.getPending();
      if (pending.length === 0) return;
      const res = await offlineSyncQueue.replay();
      if (res.synced > 0) {
        toast.success(
          `Synced ${res.synced} offline edit${res.synced === 1 ? '' : 's'} to MongoDB`,
        );
      }
    };

    void syncQueuedEdits();
    window.addEventListener('online', syncQueuedEdits);
    return () => window.removeEventListener('online', syncQueuedEdits);
  }, []);

  return (
    <>
      <main
        key={location.pathname}
        className="min-h-screen bg-[#f6f7f9] text-[#111827] antialiased transition-colors duration-200 dark:bg-[#0f1115] dark:text-[#f3f4f6]"
      >
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workspace/:id" element={<Workspace />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <OfflineIndicator />

      <Toaster
        position="bottom-right"
        theme={theme}
        richColors
        closeButton
        expand={false}
        gap={8}
        offset={20}
        toastOptions={{
          duration: 3500,
          className: [
            'rounded-xl',
            'border',
            'shadow-[0_12px_40px_rgba(15,23,42,0.12)]',
            'text-[13px]',
            'font-medium',
            'backdrop-blur-xl',
            'bg-white/95',
            'border-[#e5e7eb]',
            'text-[#111827]',
            'dark:bg-[#17191f]/95',
            'dark:border-[#292d36]',
            'dark:text-[#f3f4f6]',
            'dark:shadow-[0_16px_50px_rgba(0,0,0,0.35)]',
          ].join(' '),
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
