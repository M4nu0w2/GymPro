import { useSyncExternalStore } from 'react';

export type ThemePref = 'dark' | 'light' | 'system';

export interface Settings {
  theme: ThemePref;
  sound: boolean;
  countdownTicks: boolean;
  weightStep: number;
}

const DEFAULTS: Settings = { theme: 'dark', sound: true, countdownTicks: true, weightStep: 2.5 };
const KEY = 'gympro.settings';
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = load();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
    localStorage.setItem('gympro.theme', current.theme);
  } catch {
    /* storage non disponibile: le impostazioni restano in memoria */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSettings,
  );
}

const darkQuery = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme(): void {
  const t = current.theme;
  const dark = t === 'dark' || (t === 'system' && !!darkQuery?.matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0d10' : '#f3f4f1');
}

darkQuery?.addEventListener('change', () => {
  if (current.theme === 'system') applyTheme();
});
