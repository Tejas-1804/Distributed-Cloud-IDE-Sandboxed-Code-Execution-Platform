import { useEffect } from 'react';

interface ShortcutHandlers {
  onSave?: () => void;
  onQuickOpen?: () => void;
  onCommandPalette?: () => void;
  onToggleSidebar?: () => void;
  onToggleTerminal?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      const key = event.key.toLowerCase();

      if (key === 's' && !event.shiftKey) {
        event.preventDefault();
        handlers.onSave?.();
        return;
      }

      if (key === 'p' && event.shiftKey) {
        event.preventDefault();
        handlers.onCommandPalette?.();
        return;
      }

      if (key === 'p' && !event.shiftKey) {
        event.preventDefault();
        handlers.onQuickOpen?.();
        return;
      }

      if (key === 'b' && !event.shiftKey) {
        event.preventDefault();
        handlers.onToggleSidebar?.();
        return;
      }

      if (event.code === 'Backquote' || key === '`') {
        event.preventDefault();
        handlers.onToggleTerminal?.();
      }
    };

    // Capture phase ensures shortcuts work reliably even when Monaco Editor has focus
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handlers]);
}
