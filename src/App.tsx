import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Dashboard } from './pages/Dashboard';
import { Workspace } from './pages/Workspace';
import { useThemeStore } from './store/useThemeStore';

export default function App() {
  const theme = useThemeStore((state) => state.theme);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workspace/:id" element={<Workspace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster
        position="bottom-right"
        theme={theme}
        toastOptions={{
          className:
            'border border-[#CBD5E1] dark:border-[#292E38] bg-white dark:bg-[#171A21] text-[#0F172A] dark:text-[#E5E7EB] text-xs',
        }}
      />
    </BrowserRouter>
  );
}
