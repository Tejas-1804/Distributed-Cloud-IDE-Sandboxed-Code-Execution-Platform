import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { useThemeStore } from '../../store/useThemeStore';

interface XtermViewProps {
  sessionId: string;
  initialScrollback: string;
  fontSize: number;
  active: boolean;
}

function getXtermTheme(mode: 'light' | 'dark') {
  if (mode === 'light') {
    return {
      background: '#FAF7F4',
      foreground: '#211A16',
      cursor: '#4B3628',
      cursorAccent: '#FAF7F4',
      selectionBackground: 'rgba(176, 137, 104, 0.28)',
      black: '#211A16',
      red: '#B65353',
      green: '#2E6F51',
      yellow: '#9E6E24',
      blue: '#3A6EA5',
      magenta: '#8B4D7A',
      cyan: '#2C7A7B',
      white: '#EAE3DC',
      brightBlack: '#6E6158',
      brightRed: '#C86464',
      brightGreen: '#3C8864',
      brightYellow: '#B98332',
      brightBlue: '#4C84BE',
      brightMagenta: '#A66294',
      brightCyan: '#3A9495',
      brightWhite: '#FFFFFF',
    };
  }

  return {
    background: '#0E0D0C',
    foreground: '#E8E2DC',
    cursor: '#C29A75',
    cursorAccent: '#0E0D0C',
    selectionBackground: 'rgba(194, 154, 117, 0.28)',
    black: '#1A1715',
    red: '#D56B6B',
    green: '#4FA477',
    yellow: '#D1A35D',
    blue: '#7AA2F7',
    magenta: '#BB9AF7',
    cyan: '#7DCFFF',
    white: '#D0C9C3',
    brightBlack: '#776F68',
    brightRed: '#E38383',
    brightGreen: '#68BC8F',
    brightYellow: '#E3B977',
    brightBlue: '#95B7FA',
    brightMagenta: '#CCAFF9',
    brightCyan: '#99DCFF',
    brightWhite: '#F5F0EB',
  };
}

export function XtermView({
  sessionId,
  initialScrollback,
  fontSize,
  active,
}: XtermViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialScrollbackRef = useRef(initialScrollback);
  initialScrollbackRef.current = initialScrollback;

  const themeMode = useThemeStore((s) => s.theme);
  const sendInput = useTerminalStore((s) => s.sendInput);
  const resizeSession = useTerminalStore((s) => s.resizeSession);
  const subscribeOutput = useTerminalStore((s) => s.subscribeOutput);
  const subscribeClear = useTerminalStore((s) => s.subscribeClear);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily:
        '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, "Liberation Mono", monospace',
      fontSize,
      lineHeight: 1.35,
      scrollback: 5000,
      convertEol: false,
      allowProposedApi: false,
      theme: getXtermTheme(useThemeStore.getState().theme),
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    if (initialScrollbackRef.current) {
      term.write(initialScrollbackRef.current);
    }

    const fitAndNotify = () => {
      if (!container.offsetWidth || !container.offsetHeight) return;
      try {
        fitAddon.fit();
        if (term.cols >= 10 && term.rows >= 2) {
          resizeSession(sessionId, term.cols, term.rows);
        }
      } catch {
        // Ignore fit measurement when hidden
      }
    };

    const rafId = requestAnimationFrame(() => {
      fitAndNotify();
      if (active) {
        term.focus();
      }
    });

    const dataDisp = term.onData((data) => {
      sendInput(sessionId, data);
    });

    const unsubOutput = subscribeOutput(sessionId, (chunk) => {
      term.write(chunk);
    });

    const unsubClear = subscribeClear(sessionId, () => {
      term.clear();
    });

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFit = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitAndNotify, 40);
    };

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    window.addEventListener('resize', scheduleFit);

    return () => {
      cancelAnimationFrame(rafId);
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      window.removeEventListener('resize', scheduleFit);
      dataDisp.dispose();
      unsubOutput();
      unsubClear();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, sendInput, resizeSession, subscribeOutput, subscribeClear]);

  // Update font size live without recreating terminal
  useEffect(() => {
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const container = containerRef.current;
    if (!term || !fitAddon || !container) return;

    term.options.fontSize = fontSize;
    if (container.offsetWidth && container.offsetHeight) {
      try {
        fitAddon.fit();
        if (term.cols >= 10 && term.rows >= 2) {
          resizeSession(sessionId, term.cols, term.rows);
        }
      } catch {
        // Ignore
      }
    }
  }, [fontSize, sessionId, resizeSession]);

  // Sync IDE light/dark theme dynamically
  useEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    term.options.theme = getXtermTheme(themeMode);
  }, [themeMode]);

  // Fit and focus when tab becomes active
  useEffect(() => {
    if (!active) return;
    const term = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const container = containerRef.current;
    if (!term || !fitAddon || !container) return;

    const timer = setTimeout(() => {
      if (container.offsetWidth && container.offsetHeight) {
        try {
          fitAddon.fit();
          resizeSession(sessionId, term.cols, term.rows);
        } catch {
          // Ignore
        }
      }
      term.focus();
    }, 20);

    return () => clearTimeout(timer);
  }, [active, sessionId, resizeSession]);

  return (
    <div
      ref={containerRef}
      onClick={() => terminalRef.current?.focus()}
      className="h-full w-full overflow-hidden px-2 py-1.5"
      aria-label="Interactive Docker Terminal"
    />
  );
}
