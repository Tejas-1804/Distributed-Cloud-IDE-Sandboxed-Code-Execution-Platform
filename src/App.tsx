import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Dashboard } from './pages/Dashboard';
import { Workspace } from './pages/Workspace';
import { useThemeStore } from './store/useThemeStore';

function AppContent() {
  const theme = useThemeStore((state) => state.theme);
  const location = useLocation();

  return (
    <>
      <main
        key={location.pathname}
        className="min-h-screen bg-[#f6f7f9] text-[#111827] antialiased transition-colors duration-200 dark:bg-[#0f1115] dark:text-[#f3f4f6]"
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workspace/:id" element={<Workspace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

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
