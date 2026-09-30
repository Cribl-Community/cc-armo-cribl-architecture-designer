import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isInCribl } from './cribl';

export type HostTheme = 'light' | 'dark';

/** Applies the Cribl shell's theme to this document. Returns a teardown fn. */
export function installThemeBridge(onTheme?: (theme: HostTheme) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data as { type?: string; theme?: HostTheme } | null;
    if (data?.type !== 'CRIBL_APP_LAYOUT') return;
    if (data.theme !== 'light' && data.theme !== 'dark') return;
    document.body.classList.toggle('dark', data.theme === 'dark');
    onTheme?.(data.theme);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

const ThemeContext = createContext<HostTheme>('light');

/** Outside Cribl there is no host to push a theme, so local demo mode follows the OS preference. */
function installLocalFallback(onTheme: (theme: HostTheme) => void): () => void {
  if (isInCribl()) return () => undefined;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.body.classList.toggle('dark', mq.matches);
    onTheme(mq.matches ? 'dark' : 'light');
  };
  apply();
  mq.addEventListener('change', apply);
  return () => mq.removeEventListener('change', apply);
}

export function HostThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<HostTheme>(() => (document.body.classList.contains('dark') ? 'dark' : 'light'));
  useEffect(() => {
    const offLocal = installLocalFallback(setTheme);
    const offBridge = installThemeBridge(setTheme);
    return () => {
      offLocal();
      offBridge();
    };
  }, []);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useHostTheme = () => useContext(ThemeContext);
