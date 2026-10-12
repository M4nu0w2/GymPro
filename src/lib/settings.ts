import { useSyncExternalStore } from 'react';

export type ThemePref = 'dark' | 'light' | 'system';

export interface Settings {
  theme: ThemePref;
  sound: boolean;
  countdownTicks: boolean;
  weightStep: number;
  /** Progressione automatica del carico */
  progression: boolean;
  /** kg proposti in più quando la progressione è guadagnata */
  progressionStep: number;
  /** Versione dello schema impostazioni, per le migrazioni */
  v: number;
}

const DEFAULTS: Settings = {
  theme: 'system',
  sound: true,
  countdownTicks: true,
  weightStep: 1,
  progression: true,
  progressionStep: 1,
  v: 2,
};
const KEY = 'gympro.settings';
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    // Impostazioni della versione precedente (tema scuro forzato): ora il tema segue il sistema
    if (!('progression' in saved)) saved.theme = 'system';
    // v2: il passo predefinito passa da 2,5 a 1 kg
    if (!saved.v || saved.v < 2) {
      if (saved.weightStep === 2.5) saved.weightStep = 1;
      if (saved.progressionStep === 2.5) saved.progressionStep = 1;
      saved.v = 2;
    }
    return { ...DEFAULTS, ...saved };
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
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#f2f2f7'));
  try {
    localStorage.setItem('gympro.theme', t);
  } catch {
    /* ignore */
  }
}

darkQuery?.addEventListener('change', () => {
  if (current.theme === 'system') applyTheme();
});
